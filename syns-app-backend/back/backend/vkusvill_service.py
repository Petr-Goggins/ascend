"""Small MCP client for the VkusVill product catalogue."""

from __future__ import annotations

import asyncio
import json
import html
import os
import re
import logging
from typing import Any
from urllib.parse import urlparse

import httpx


DEFAULT_MCP_URL = "https://mcp001.vkusvill.ru/mcp"
ALLOWED_MCP_HOSTS = {"mcp001.vkusvill.ru", "mcp.vkusvill.ru"}
logger = logging.getLogger(__name__)


class VkusVillError(RuntimeError):
    """A safe, user-displayable product catalogue error."""


def _configured_url(url_override: str | None = None) -> str:
    url = url_override or os.getenv("VKUSVILL_MCP_URL") or os.getenv("VITE_VKUSVILL_API_URL") or DEFAULT_MCP_URL
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_MCP_HOSTS or parsed.path.rstrip("/") != "/mcp":
        raise VkusVillError("Некорректный адрес MCP ВкусВилл.")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise VkusVillError("Адрес MCP ВкусВилл должен содержать только HTTPS URL.")
    return url.rstrip("/")


def _parse_response(response: httpx.Response) -> dict[str, Any]:
    if response.status_code == 401:
        raise VkusVillError(
            "MCP ВкусВилл требует авторизацию аккаунта (OAuth). Одного URL недостаточно для текущего ответа сервера."
        )
    if response.status_code == 403:
        raise VkusVillError("Доступ к каталогу ВкусВилл не разрешён для текущей авторизации.")
    if response.is_error:
        raise VkusVillError(f"MCP ВкусВилл вернул HTTP {response.status_code}.")

    content_type = response.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        for line in response.text.splitlines():
            if line.startswith("data:"):
                try:
                    payload = json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    continue
                if isinstance(payload, dict):
                    return payload
        raise VkusVillError("MCP ВкусВилл вернул пустой ответ.")

    try:
        payload = response.json()
    except ValueError as exc:
        raise VkusVillError("MCP ВкусВилл вернул ответ в неизвестном формате.") from exc
    if not isinstance(payload, dict):
        raise VkusVillError("MCP ВкусВилл вернул ответ в неизвестном формате.")
    return payload


async def _rpc(
    client: httpx.AsyncClient,
    url: str,
    request_id: int,
    method: str,
    params: dict[str, Any] | None = None,
    session_id: str | None = None,
) -> tuple[dict[str, Any], str | None]:
    headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id
        headers["MCP-Protocol-Version"] = "2024-11-05"
    access_token = os.getenv("VKUSVILL_ACCESS_TOKEN")
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    payload: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
    }
    if params is not None:
        payload["params"] = params
    try:
        response = await client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        raise VkusVillError("Истекло время ожидания ответа MCP ВкусВилл.") from exc
    except httpx.RequestError as exc:
        raise VkusVillError("Не удалось подключиться к MCP ВкусВилл.") from exc

    data = _parse_response(response)
    new_session = response.headers.get("Mcp-Session-Id") or session_id
    rpc_error = data.get("error")
    if isinstance(rpc_error, dict):
        message = str(rpc_error.get("message") or "Ошибка вызова MCP.")
        raise VkusVillError(message[:300])
    return data, new_session


def _search_tool(tools: list[dict[str, Any]]) -> dict[str, Any]:
    candidates = []
    for tool in tools:
        name = str(tool.get("name", ""))
        description = str(tool.get("description", ""))
        searchable = f"{name} {description}".lower()
        if any(word in searchable for word in ("search", "поиск", "найти")) and any(
            word in searchable for word in ("product", "товар", "каталог")
        ):
            candidates.append(tool)
    if not candidates:
        raise VkusVillError("В MCP ВкусВилл не найден инструмент поиска товаров.")
    return candidates[0]


def _tool_arguments(tool: dict[str, Any], query: str) -> dict[str, Any]:
    schema = tool.get("inputSchema")
    properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
    if not isinstance(properties, dict):
        return {"query": query}
    preferred_keys = ("query", "q", "search_query", "searchQuery", "text", "name", "product_name")
    for key in preferred_keys:
        if key in properties:
            arguments: dict[str, Any] = {key: query}
            if "limit" in properties:
                arguments["limit"] = 10
            return arguments
    string_key = next((key for key, value in properties.items() if isinstance(value, dict) and value.get("type") == "string"), None)
    return {string_key: query} if string_key else {"query": query}


def _extract_items(result: dict[str, Any]) -> list[dict[str, Any]]:
    def find_list(value: Any) -> list[dict[str, Any]] | None:
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            for key in ("products", "items", "results", "data"):
                found = find_list(value.get(key))
                if found is not None:
                    return found
        return None

    direct = result.get("structuredContent", result.get("result"))
    direct_items = find_list(direct)
    if direct_items is not None:
        return direct_items

    content = result.get("content")
    if isinstance(content, list):
        for entry in content:
            if not isinstance(entry, dict) or not isinstance(entry.get("text"), str):
                continue
            try:
                parsed = json.loads(entry["text"])
            except json.JSONDecodeError:
                continue
            parsed_items = find_list(parsed)
            if parsed_items is not None:
                return parsed_items
    return []


def _tool_payload(result: dict[str, Any]) -> dict[str, Any]:
    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        data = structured.get("data")
        return data if isinstance(data, dict) else structured
    content = result.get("content")
    if isinstance(content, list):
        for entry in content:
            if not isinstance(entry, dict) or not isinstance(entry.get("text"), str):
                continue
            try:
                parsed = json.loads(entry["text"])
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                data = parsed.get("data")
                return data if isinstance(data, dict) else parsed
    return {}


def _property(details: dict[str, Any], *terms: str) -> str | None:
    properties = details.get("properties")
    if not isinstance(properties, list):
        return None
    for item in properties:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).casefold()
        value = item.get("value")
        if isinstance(value, str) and any(term in name for term in terms):
            return html.unescape(re.sub(r"<[^>]*>", " ", value)).strip()
    return None


def _nutrition_number(text: str, labels: tuple[str, ...], unit_pattern: str) -> float:
    label_pattern = "|".join(labels)
    match = re.search(
        rf"(?:{label_pattern})\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)\s*{unit_pattern}",
        text,
        flags=re.IGNORECASE,
    )
    return float(match.group(1).replace(",", ".")) if match else 0.0


def _nutrition(details: dict[str, Any]) -> dict[str, Any]:
    value = _property(details, "пищев", "энергетичес", "nutrition", "nutritional")
    if not value:
        return {"proteins": 0.0, "fats": 0.0, "carbs": 0.0, "calories": 0.0}
    return {
        "proteins": _nutrition_number(value, (r"белк\w*", r"protein\w*"), r"(?:г|g)\b"),
        "fats": _nutrition_number(value, (r"жир\w*", r"fat\w*"), r"(?:г|g)\b"),
        "carbs": _nutrition_number(value, (r"углевод\w*", r"carbohydrat\w*", r"carb\w*"), r"(?:г|g)\b"),
        "calories": _calorie_number(value),
    }


def _calorie_number(text: str) -> float:
    match = re.search(r"([0-9]+(?:[.,][0-9]+)?)\s*(?:ккал|kcal)(?!\w)", text, flags=re.IGNORECASE)
    return float(match.group(1).replace(",", ".")) if match else 0.0


async def _product_details(
    client: httpx.AsyncClient,
    url: str,
    session_id: str | None,
    request_id: int,
    tool: dict[str, Any],
    product_id: Any,
) -> dict[str, Any]:
    try:
        numeric_id = int(product_id)
    except (TypeError, ValueError) as exc:
        raise VkusVillError("MCP ВкусВилл вернул товар без корректного ID.") from exc
    response, _ = await _rpc(
        client,
        url,
        request_id,
        "tools/call",
        {"name": tool["name"], "arguments": {"id": numeric_id}},
        session_id,
    )
    result = response.get("result")
    if not isinstance(result, dict) or result.get("isError"):
        raise VkusVillError("Не удалось загрузить детали товара из ВкусВилл.")
    details = _tool_payload(result)
    return details


def _number(item: dict[str, Any], *keys: str) -> float:
    for key in keys:
        value = item.get(key)
        if value is not None:
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
    return 0.0


def _normalize(items: list[dict[str, Any]], details_by_id: dict[str, dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    normalized = []
    for item in items:
        name = item.get("name") or item.get("title") or item.get("product_name")
        if not isinstance(name, str) or not name.strip():
            continue
        product_id_value = item.get("id")
        if product_id_value is None:
            product_id_value = item.get("product_id")
        product_id = str(product_id_value if product_id_value is not None else name)
        details = (details_by_id or {}).get(product_id, {})
        nutrition = _nutrition(details) if details else {
            "proteins": _number(item, "proteins", "protein", "protein_g"),
            "fats": _number(item, "fats", "fat", "fat_g"),
            "carbs": _number(item, "carbs", "carbohydrates", "carbohydrate_g"),
            "calories": _number(item, "calories", "kcal", "energy_kcal"),
        }
        price = item.get("price")
        rating = item.get("rating")
        detail_price = details.get("price")
        detail_rating = details.get("rating")
        if isinstance(detail_price, dict):
            price = detail_price
        if isinstance(detail_rating, dict):
            rating = detail_rating
        detail_name = details.get("name")
        detail_brand = details.get("brand")
        normalized.append({
            "id": product_id,
            "name": html.unescape(detail_name if isinstance(detail_name, str) else name).strip(),
            "brand": detail_brand if isinstance(detail_brand, str) else item.get("brand") if isinstance(item.get("brand"), str) else "ВкусВилл",
            **nutrition,
            "price": _number(price, "current") if isinstance(price, dict) else _number(item, "price"),
            "rating": _number(rating, "average") if isinstance(rating, dict) else _number(item, "rating"),
            "url": details.get("url") if isinstance(details.get("url"), str) else item.get("url") if isinstance(item.get("url"), str) else None,
            "ingredients": _property(details, "состав", "ingredients"),
            "nutrition_info": _property(details, "пищев", "энергетичес", "nutrition", "nutritional"),
        })
    return normalized


async def search_products(query: str, url_override: str | None = None) -> list[dict[str, Any]]:
    url = _configured_url(url_override)
    timeout = httpx.Timeout(8.0, connect=3.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        initialized, session_id = await _rpc(
            client,
            url,
            1,
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "ascend-app", "version": "1.0.0"},
            },
        )
        if not isinstance(initialized.get("result"), dict):
            raise VkusVillError("Не удалось инициализировать MCP ВкусВилл.")
        try:
            notification = await client.post(
                url,
                headers={
                    "Accept": "application/json, text/event-stream",
                    "Content-Type": "application/json",
                    **({"Mcp-Session-Id": session_id} if session_id else {}),
                    **({"MCP-Protocol-Version": "2024-11-05"} if session_id else {}),
                },
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            )
        except httpx.RequestError as exc:
            raise VkusVillError("Не удалось подключиться к MCP ВкусВилл.") from exc
        if notification.is_error:
            _parse_response(notification)
        listed, session_id = await _rpc(client, url, 2, "tools/list", {}, session_id)
        tools = listed.get("result", {}).get("tools", [])
        if not isinstance(tools, list):
            raise VkusVillError("MCP ВкусВилл не вернул список инструментов.")
        tool = _search_tool([item for item in tools if isinstance(item, dict)])
        called, _ = await _rpc(
            client,
            url,
            3,
            "tools/call",
            {"name": tool["name"], "arguments": _tool_arguments(tool, query)},
            session_id,
        )
        result = called.get("result")
        if not isinstance(result, dict):
            raise VkusVillError("MCP ВкусВилл не вернул результаты поиска.")
        if result.get("isError"):
            raise VkusVillError("Поиск в каталоге ВкусВилл завершился ошибкой.")
        products = _extract_items(result)
        detail_tools = [
            item for item in tools
            if isinstance(item, dict)
            and "product" in str(item.get("name", "")).lower()
            and any(term in str(item.get("name", "")).lower() for term in ("detail", "details"))
        ]
        details_by_id: dict[str, dict[str, Any]] = {}
        if detail_tools:
            detail_tool = detail_tools[0]
            semaphore = asyncio.Semaphore(3)

            async def load_details(index: int, product: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
                product_id = product.get("id")
                if product_id is None:
                    product_id = product.get("product_id")
                if product_id is None:
                    return None
                async with semaphore:
                    try:
                        details = await _product_details(
                            client, url, session_id, index, detail_tool, product_id
                        )
                        return str(product_id), details
                    except VkusVillError as exc:
                        logger.warning("Could not load VkusVill details for product %s: %s", product_id, exc)
                        return None

            detail_results = await asyncio.gather(
                *(load_details(index, product) for index, product in enumerate(products[:3], start=4))
            )
            details_by_id = {
                product_id: details
                for result in detail_results
                if result is not None
                for product_id, details in [result]
            }
        else:
            logger.info("MCP VkusVill does not expose product details; returning search results as-is")
        return _normalize(products, details_by_id)
