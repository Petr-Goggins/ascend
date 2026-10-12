import json
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

import main
import workout_plan_service as service
from ai_service import AIProviderConfigurationError


def make_plan(*, include_core: bool = True) -> dict:
    progression = (
        "Двойная прогрессия: повышать вес после достижения верхней границы повторений. "
        "Неделя 4 разгрузочная: объём подходов ниже на 40–50%, интенсивность ниже на 10–20%."
    )
    structure = {}
    for week in range(1, 5):
        sets = 2 if week == 4 else 4
        days = {}
        training_days = ("Понедельник", "Среда", "Пятница")
        for day in ("Понедельник", "Вторник", "Среда", "Четверг", "Пятница"):
            if day not in training_days:
                days[day] = ["Отдых и восстановление"]
                continue
            exercises = [
                "Разминка — 5–10 минут",
                f"Жим гантелей лёжа — {sets}×8–10, RIR 2–3, отдых 90–120 секунд",
                f"Тяга гантели к поясу — {sets}×8–10, RIR 2–3, отдых 90–120 секунд",
                f"Приседания с собственным весом — {sets}×8–10, RIR 2–3, отдых 90–120 секунд",
            ]
            if include_core:
                exercises.append(f"Планка — {sets}×30–40, RIR 2–3, отдых 60–90 секунд")
            exercises.append("Заминка — 5 минут; тренировка около 45 минут")
            days[day] = exercises
        structure[f"Неделя {week}" + (" (разгрузка)" if week == 4 else "")] = days
    return {
        "goal": "Общая физическая подготовка",
        "weeks": 4,
        "days_per_week": 3,
        "progression": progression,
        "structure": structure,
    }


class WorkoutPlanValidationTests(unittest.TestCase):
    def test_complete_beginner_full_body_plan_passes(self):
        self.assertEqual(
            service.validate_workout_plan(
                make_plan(),
                {"training_level": "beginner", "days_per_week": 3},
            ),
            [],
        )

    def test_triceps_pulldown_does_not_count_as_back_pull(self):
        categories = service._exercise_categories(["Тяга верхнего блока на трицепс"])
        self.assertNotIn("pull", categories)

    def test_leg_press_is_not_counted_as_an_upper_body_push(self):
        categories = service._exercise_categories(["Жим ногами в тренажёре"])
        self.assertEqual(categories, {"legs"})

    def test_accepts_common_sets_and_rest_formats(self):
        plan = make_plan()
        for days in plan["structure"].values():
            for exercises in days.values():
                exercises[:] = [
                    exercise.replace(
                        "Жим гантелей лёжа — 4×8–10, RIR 2–3, отдых 90–120 секунд",
                        "Жим гантелей лёжа — 4 подхода по 8–10, RIR 2–3, пауза 90–120 секунд",
                    )
                    for exercise in exercises
                ]
        self.assertEqual(
            service.validate_workout_plan(
                plan,
                {"training_level": "beginner", "days_per_week": 3},
            ),
            [],
        )

    def test_missing_core_blocks_beginner_plan(self):
        issues = service.validate_workout_plan(
            make_plan(include_core=False),
            {"training_level": "beginner", "days_per_week": 3},
        )
        self.assertTrue(any("кор" in issue for issue in issues))

    def test_prompts_include_methodology_and_independent_review_criteria(self):
        creator, reviewer = service._build_prompts(
            {"training_level": "beginner", "days_per_week": 3},
            "- Уровень: beginner",
        )
        self.assertIn("горизонтальная тяга и горизонтальный жим примерно 1:1", creator)
        self.assertIn("6–10", creator)
        self.assertIn("динамическую мобилизацию", creator)
        self.assertIn("сначала все подходы достигают верхней границы", creator)
        self.assertIn("независимый строгий критик", reviewer)
        self.assertIn("1,5:1", reviewer)

    def test_advanced_prompt_uses_methodology_frequency_not_beginner_rules(self):
        creator, reviewer = service._build_prompts(
            {"training_level": "advanced", "days_per_week": 4},
            "- Уровень: advanced",
        )
        self.assertIn("продвинутый (2+ года) — обычно 4–5 дней", creator)
        self.assertNotIn("при 3 днях — Пн/Ср/Пт", creator)
        self.assertIn("Do not impose beginner full-body", reviewer)


class WorkoutPlanReviewTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_ai_credentials_are_not_mistaken_for_bad_plan_json(self):
        mocked = AsyncMock(side_effect=AIProviderConfigurationError(
            "AI provider is not configured: ZVENO_API_KEY is missing"
        ))
        with patch.object(service, "ask_ai", mocked):
            with self.assertRaises(AIProviderConfigurationError):
                await service.generate_reviewed_plan({"training_level": "beginner", "days_per_week": 3})

        mocked.assert_awaited_once()

    async def test_critic_rejects_then_approves_revision(self):
        plan = make_plan()
        responses = iter([
            json.dumps(plan, ensure_ascii=False),
            '{"approved":false,"issues":["Добавить более простую альтернативу упражнению"]}',
            json.dumps(plan, ensure_ascii=False),
            '{"approved":true,"issues":[]}',
        ])
        progress = []

        async def fake_ask_ai(*args, **kwargs):
            return next(responses)

        with patch.object(service, "ask_ai", fake_ask_ai):
            result = await service.generate_reviewed_plan(
                {"training_level": "beginner", "days_per_week": 3},
                progress.append,
            )

        self.assertEqual(result["review_status"], "approved")
        self.assertEqual(result["review_cycles"], 2)
        self.assertEqual(
            [event["stage"] for event in progress],
            ["draft", "critique", "revision", "critique", "quality_check"],
        )
        self.assertTrue(all(event["estimated_remaining_seconds"] > 0 for event in progress))

    async def test_mandatory_compliant_plan_is_selected_over_less_compliant_draft(self):
        compliant_plan = make_plan()
        invalid_plan = make_plan()
        invalid_plan["progression"] = invalid_plan["progression"].replace("40–50%", "40%")
        responses = iter([
            json.dumps(invalid_plan, ensure_ascii=False),
            json.dumps(compliant_plan, ensure_ascii=False),
            '{"approved":false,"issues":["Добавить альтернативу упражнению","Уточнить темп выполнения"]}',
            json.dumps(compliant_plan, ensure_ascii=False),
            '{"approved":false,"issues":["Добавить альтернативу упражнению","Уточнить темп выполнения"]}',
        ])

        async def fake_ask_ai(*args, **kwargs):
            return next(responses)

        with patch.object(service, "ask_ai", fake_ask_ai):
            result = await service.generate_reviewed_plan(
                {"training_level": "beginner", "days_per_week": 3}
            )

        self.assertEqual(result["review_status"], "best_after_revisions")
        self.assertEqual(result["review_cycles"], 3)
        self.assertEqual(
            service.validate_workout_plan(result, {"training_level": "beginner", "days_per_week": 3}),
            [],
        )
        self.assertEqual(len(result["review_notes"]), 2)

    async def test_plan_failing_required_checks_is_not_returned(self):
        plan = make_plan(include_core=False)
        responses = iter(
            item
            for _ in range(service.MAX_REVIEW_CYCLES)
            for item in (
                json.dumps(plan, ensure_ascii=False),
                '{"approved":false,"issues":["Добавить кор"]}',
            )
        )

        async def fake_ask_ai(*args, **kwargs):
            return next(responses)

        with patch.object(service, "ask_ai", fake_ask_ai):
            with self.assertRaises(HTTPException) as error:
                await service.generate_reviewed_plan(
                    {"training_level": "beginner", "days_per_week": 3}
                )

        self.assertEqual(error.exception.status_code, 502)
        self.assertIn("добавить кор", error.exception.detail)


class WorkoutPlanStreamTests(unittest.TestCase):
    def test_stream_sends_progress_before_final_plan(self):
        async def fake_generate(user_data, progress=None):
            progress({
                "stage": "draft",
                "attempt": 1,
                "max_attempts": 3,
                "message": "draft",
                "estimated_remaining_seconds": 100,
            })
            progress({
                "stage": "critique",
                "attempt": 1,
                "max_attempts": 3,
                "message": "critique",
                "estimated_remaining_seconds": 50,
            })
            return {
                "goal": "test",
                "weeks": 4,
                "days_per_week": 3,
                "structure": {"week": {}},
                "review_status": "approved",
            }

        with patch.object(main, "generate_reviewed_plan", fake_generate):
            with TestClient(main.app) as client:
                response = client.post("/plans/generate/stream", json={"user_data": {}})

        self.assertEqual(response.status_code, 200)
        data_events = [
            json.loads(line[6:])
            for line in response.text.splitlines()
            if line.startswith("data: ")
        ]
        self.assertEqual([event["stage"] for event in data_events], ["draft", "critique", "complete"])

    def test_stream_explains_ai_connection_failure(self):
        async def fake_generate(user_data, progress=None):
            raise RuntimeError("Zveno connection failed: ConnectError")

        with patch.object(main, "generate_reviewed_plan", fake_generate):
            with TestClient(main.app) as client:
                response = client.post("/plans/generate/stream", json={"user_data": {}})

        error_events = [
            json.loads(line[6:])
            for line in response.text.splitlines()
            if line.startswith("data: ")
        ]
        self.assertEqual(error_events[-1]["stage"], "error")
        self.assertIn("подключиться к Zveno AI", error_events[-1]["detail"])


class AIProviderErrorTests(unittest.TestCase):
    def test_chat_profile_formatter_includes_context_and_activity_level(self):
        formatted = main.format_user_data({
            "activity_level": "moderate",
            "context": "Недавняя тренировка: присед 50 кг",
            "pushups_max": 12,
            "pullups_max": 3,
            "gender": "male",
            "age": 30,
            "height": 180,
            "weight": 80,
            "goal": "lose",
        })

        self.assertIn("Уровень активности: moderate", formatted)
        self.assertIn("Недавняя тренировка: присед 50 кг", formatted)
        self.assertIn("12 / 3", formatted)
        self.assertIn("поддержание=2759 ккал; цель=2345 ккал", formatted)
        self.assertIn("Б=144 г, Ж=72 г, У=280 г", formatted)

    def test_mifflin_targets_are_not_computed_for_children(self):
        self.assertIsNone(main.calculate_nutrition_targets({
            "gender": "female",
            "age": 17,
            "height": 165,
            "weight": 60,
            "activity_level": "light",
            "goal": "maintain",
        }))

    def test_ai_endpoint_explains_missing_key_without_leaking_configuration(self):
        async def missing_key(*args, **kwargs):
            raise ValueError("AI provider is not configured: ZVENO_API_KEY is missing")

        with patch.object(main, "ask_ai", missing_key):
            with TestClient(main.app) as client:
                response = client.post("/ai/ask", json={"message": "Привет"})

        self.assertEqual(response.status_code, 503)
        self.assertIn("ZVENO_API_KEY", response.json()["detail"])

    def test_ai_endpoint_maps_global_free_quota_exhaustion(self):
        async def exhausted_quota(*args, **kwargs):
            raise RuntimeError(
                'Zveno returned HTTP 429: {"code":"free_model_platform_daily_limit_reached"}'
            )

        with patch.object(main, "ask_ai", exhausted_quota):
            with TestClient(main.app) as client:
                response = client.post("/ai/ask", json={"message": "Привет"})

        self.assertEqual(response.status_code, 429)
        self.assertIn("общий дневной лимит", response.json()["detail"])
        self.assertNotIn("free_model_platform_daily_limit_reached", response.json()["detail"])

    def test_ai_health_does_not_expose_key(self):
        with TestClient(main.app) as client:
            response = client.get("/health/ai")

        self.assertEqual(response.status_code, 200)
        self.assertIn("configured", response.json())
        self.assertNotIn("api_key", response.json())

    def test_meal_plan_endpoint_uses_shared_provider_error_mapping(self):
        async def provider_unavailable(*args, **kwargs):
            raise RuntimeError("Zveno connection failed: ConnectError")

        with patch.object(main, "ask_ai", provider_unavailable):
            with TestClient(main.app) as client:
                response = client.post("/meal-plans/generate", json={"user_data": {}})

        self.assertEqual(response.status_code, 502)
        self.assertIn("подключиться к Zveno AI", response.json()["detail"])

    def test_api_prefixed_ai_route_aliases_work_with_documented_base_url(self):
        async def fake_ask_ai(*args, **kwargs):
            return "Ответ"

        with patch.object(main, "ask_ai", fake_ask_ai):
            with TestClient(main.app) as client:
                response = client.post("/api/ai/ask", json={"message": "Привет"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"reply": "Ответ"})

    def test_provider_errors_are_actionable_and_sanitized(self):
        cases = [
            (ValueError("ZVENO_API_KEY is missing"), 503, "ZVENO_API_KEY"),
            (RuntimeError("Zveno returned HTTP 401: invalid key"), 503, "отклонил ключ"),
            (RuntimeError("Zveno returned HTTP 402: balance"), 402, "недостаточно средств"),
            (RuntimeError("Zveno timed out for model test/model"), 504, "не ответил вовремя"),
            (RuntimeError("Zveno returned HTTP 429: rate limit"), 429, "лимит запросов"),
        ]
        for error, status_code, message in cases:
            with self.subTest(status_code=status_code):
                mapped = main._ai_provider_error(error)
                self.assertEqual(mapped.status_code, status_code)
                self.assertIn(message.lower(), str(mapped.detail).lower())


if __name__ == "__main__":
    unittest.main()
