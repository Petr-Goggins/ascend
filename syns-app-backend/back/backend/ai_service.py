import asyncio
import logging
import os
import re

import httpx
from dotenv import load_dotenv

load_dotenv()

ZVENO_API_KEY = os.getenv("ZVENO_API_KEY") or os.getenv("OPENROUTER_API_KEY")
ZVENO_BASE_URL = (
    os.getenv("ZVENO_BASE_URL")
    or os.getenv("OPENROUTER_BASE_URL")
    or "https://api.zveno.ai/v1"
)
SITE_URL = os.getenv("SITE_URL", "http://localhost:8000")
SITE_TITLE = os.getenv("SITE_TITLE", "Ascend")
DEFAULT_MODEL = (
    os.getenv("ZVENO_MODEL")
    or os.getenv("OPENROUTER_MODEL")
    or "inclusionai/ling-3.0-flash-sante:free"
)
logger = logging.getLogger(__name__)
MODEL_ID_PATTERN = re.compile(r"[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(?::[A-Za-z0-9._-]+)?")


class AIProviderConfigurationError(RuntimeError):
    """Raised when an AI request cannot start because provider credentials are absent."""


def _model_ids(value: str) -> list[str]:
    return [model.strip() for model in value.split(",") if MODEL_ID_PATTERN.fullmatch(model.strip())]


def _rate_limit_alternatives(response: httpx.Response) -> list[str]:
    try:
        data = response.json()
    except ValueError:
        return []
    error = data.get("error") if isinstance(data, dict) else None
    metadata = error.get("metadata") if isinstance(error, dict) else None
    alternatives = metadata.get("alternatives") if isinstance(metadata, dict) else None
    if not isinstance(alternatives, list):
        return []
    return [
        model
        for model in alternatives
        if isinstance(model, str) and len(model) <= 120 and MODEL_ID_PATTERN.fullmatch(model)
    ]


def _is_global_free_quota_error(response: httpx.Response) -> bool:
    try:
        data = response.json()
    except ValueError:
        return False
    error = data.get("error") if isinstance(data, dict) else None
    if not isinstance(error, dict):
        return False
    metadata = error.get("metadata")
    code = error.get("code")
    message = error.get("message")
    return (
        code == "free_model_platform_daily_limit_reached"
        or isinstance(metadata, dict)
        and metadata.get("free_model_platform_daily_limit_reached") is True
        or isinstance(message, str)
        and "free_model_platform_daily_limit_reached" in message
    )


def provider_status() -> dict[str, str | bool | int]:
    fallbacks = _model_ids(
        os.getenv("ZVENO_FALLBACK_MODELS")
        or os.getenv("OPENROUTER_FALLBACK_MODELS", "")
    )
    return {
        "provider": "Zveno AI",
        "configured": bool(ZVENO_API_KEY),
        "model": DEFAULT_MODEL,
        "fallback_count": len(fallbacks),
    }


async def ask_ai(user_message: str, system_prompt: str, max_tokens: int = 800) -> str:
    """Send a chat completion to Zveno AI, trying configured models on transient failures."""
    if not ZVENO_API_KEY:
        raise AIProviderConfigurationError("AI provider is not configured: ZVENO_API_KEY is missing")

    request_url = f"{ZVENO_BASE_URL.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {ZVENO_API_KEY}",
        "HTTP-Referer": SITE_URL,
        "X-OpenRouter-Title": SITE_TITLE,
        "Content-Type": "application/json",
    }
    configured_fallbacks = _model_ids(
        os.getenv("ZVENO_FALLBACK_MODELS")
        or os.getenv("OPENROUTER_FALLBACK_MODELS", "")
    )
    models_to_try = [DEFAULT_MODEL, *configured_fallbacks]
    tried: set[str] = set()
    last_error: RuntimeError | None = None

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        while models_to_try and len(tried) < 5:
            model = models_to_try.pop(0)
            if model in tried:
                continue
            tried.add(model)
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.3,
                "max_tokens": max_tokens,
            }
            should_try_next_model = False

            for attempt in range(2):
                try:
                    response = await client.post(request_url, headers=headers, json=payload)
                except httpx.TimeoutException:
                    if attempt == 0:
                        logger.warning("Zveno timed out for model %s; retrying once", model)
                        await asyncio.sleep(0.7)
                        continue
                    last_error = RuntimeError(f"Zveno timed out for model {model}")
                    should_try_next_model = True
                    break
                except httpx.ConnectError:
                    last_error = RuntimeError("Zveno connection failed: ConnectError")
                    logger.warning("Could not connect to Zveno; skipping remaining fallback models")
                    should_try_next_model = False
                    break
                except httpx.RequestError as exc:
                    if attempt == 0:
                        logger.warning(
                            "Zveno connection error (%s); retrying once",
                            type(exc).__name__,
                        )
                        await asyncio.sleep(0.7)
                        continue
                    last_error = RuntimeError(f"Zveno connection failed: {type(exc).__name__}")
                    should_try_next_model = True
                    break

                if response.status_code == 429:
                    detail = response.text[:300].replace(ZVENO_API_KEY, "[redacted]")
                    last_error = RuntimeError(f"Zveno returned HTTP 429: {detail}")
                    if _is_global_free_quota_error(response):
                        last_error = RuntimeError(
                            "Zveno returned HTTP 429: free_model_platform_daily_limit_reached"
                        )
                        logger.warning("Zveno free-model daily quota is exhausted")
                        raise last_error
                    for alternative in _rate_limit_alternatives(response):
                        if alternative not in tried and alternative not in models_to_try:
                            models_to_try.append(alternative)
                    logger.warning("Zveno rate limited model %s; trying another model", model)
                    should_try_next_model = True
                    break

                if response.status_code in (408, 500, 502, 503, 504) and attempt == 0:
                    logger.warning(
                        "Zveno returned HTTP %s for model %s; retrying once",
                        response.status_code,
                        model,
                    )
                    await asyncio.sleep(0.7)
                    continue

                if response.is_error:
                    status = response.status_code
                    detail = response.text[:300].replace(ZVENO_API_KEY, "[redacted]")
                    last_error = RuntimeError(f"Zveno returned HTTP {status}: {detail}")
                    if status in (401, 402, 403):
                        raise last_error
                    if status in (400, 401, 403, 404, 408, 500, 502, 503, 504):
                        logger.warning(
                            "Zveno returned HTTP %s for model %s; trying a fallback",
                            status,
                            model,
                        )
                        should_try_next_model = True
                        break
                    raise last_error

                try:
                    data = response.json()
                    choices = data.get("choices") if isinstance(data, dict) else None
                    message = choices[0].get("message") if isinstance(choices, list) and choices else None
                    content = message.get("content") if isinstance(message, dict) else None
                except (ValueError, AttributeError, IndexError, TypeError):
                    content = None

                if not isinstance(content, str) or not content.strip():
                    last_error = RuntimeError(f"Zveno returned an empty response for model {model}")
                    logger.warning("Zveno returned an empty response for model %s", model)
                    should_try_next_model = True
                    break
                return content.strip()

            if not should_try_next_model:
                break

    if last_error:
        raise last_error
    raise RuntimeError("Zveno did not return a response")
