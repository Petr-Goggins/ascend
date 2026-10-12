import os
import unittest
from unittest.mock import patch

import httpx

import ai_service


class FakeAsyncClient:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def post(self, *args, **kwargs):
        self.calls += 1
        if self.error:
            raise self.error
        return self.response


class AIServiceFallbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_global_free_quota_does_not_burn_requests_on_fallbacks(self):
        response = httpx.Response(
            429,
            json={
                "error": {
                    "code": 429,
                    "message": "rate limit exceeded",
                    "metadata": {
                        "free_model_platform_daily_limit_reached": True,
                        "alternatives": ["backup/model:free"],
                    },
                }
            },
            request=httpx.Request("POST", "https://api.zveno.ai/v1/chat/completions"),
        )
        client = FakeAsyncClient(response=response)

        with (
            patch.object(ai_service, "ZVENO_API_KEY", "test-key"),
            patch.dict(os.environ, {"ZVENO_FALLBACK_MODELS": "backup/model:free"}),
            patch.object(ai_service.httpx, "AsyncClient", return_value=client),
        ):
            with self.assertRaisesRegex(RuntimeError, "free_model_platform_daily_limit_reached"):
                await ai_service.ask_ai("test", "test")

        self.assertEqual(client.calls, 1)

    async def test_connection_failure_does_not_retry_each_model(self):
        client = FakeAsyncClient(error=httpx.ConnectError("offline"))

        with (
            patch.object(ai_service, "ZVENO_API_KEY", "test-key"),
            patch.dict(os.environ, {"ZVENO_FALLBACK_MODELS": "backup/model:free"}),
            patch.object(ai_service.httpx, "AsyncClient", return_value=client),
        ):
            with self.assertRaisesRegex(RuntimeError, "connection failed"):
                await ai_service.ask_ai("test", "test")

        self.assertEqual(client.calls, 1)


if __name__ == "__main__":
    unittest.main()
