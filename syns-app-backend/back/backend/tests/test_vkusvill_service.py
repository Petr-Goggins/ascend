import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import vkusvill_service as service


class FakeClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, *args, **kwargs):
        return SimpleNamespace(is_error=False)


class ProductSearchTests(unittest.IsolatedAsyncioTestCase):
    async def _search(self, tools):
        products = [{"id": index, "name": f"Продукт {index}", "calories": 100} for index in range(8)]

        async def rpc(_client, _url, _id, method, *_args):
            if method == "initialize":
                return {"result": {}}, "session"
            if method == "tools/list":
                return {"result": {"tools": tools}}, "session"
            if method == "tools/call":
                return {"result": {"structuredContent": {"products": products}}}, "session"
            raise AssertionError(f"Unexpected MCP method {method}")

        details = AsyncMock(return_value={"properties": []})
        with (
            patch.object(service.httpx, "AsyncClient", return_value=FakeClient()),
            patch.object(service, "_rpc", side_effect=rpc),
            patch.object(service, "_product_details", details),
        ):
            result = await service.search_products("творог")
        return result, details

    async def test_only_top_three_product_details_are_loaded(self):
        result, details = await self._search([
            {"name": "search_products", "description": "search product catalog"},
            {"name": "get_product_details", "description": "product details"},
        ])

        self.assertEqual(len(result), 8)
        self.assertEqual(details.await_count, 3)

    async def test_search_results_work_without_a_details_tool(self):
        result, details = await self._search([
            {"name": "search_products", "description": "search product catalog"},
        ])

        self.assertEqual(len(result), 8)
        self.assertEqual(result[0]["calories"], 100)
        details.assert_not_awaited()

