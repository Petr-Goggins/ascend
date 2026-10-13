"""FastAPI backend for Ascend."""

from __future__ import annotations

import json
import logging
import math
import os
import asyncio
from collections.abc import Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import httpx

from ai_service import ask_ai, provider_status
from rag_service import index_knowledge_base
from vkusvill_service import VkusVillError, search_products as search_vkusvill_products
from workout_plan_service import generate_reviewed_plan

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up — indexing knowledge base...")
    try:
        index_knowledge_base()
    except Exception:
        logger.exception("Knowledge base indexing failed on startup")
    yield
    logger.info("Shutting down")


app = FastAPI(title="Ascend API", lifespan=lifespan)
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


def _ai_provider_error(exc: Exception) -> HTTPException:
    message = str(exc)
    normalized = message.lower()

    if isinstance(exc, ValueError) and "zveno_api_key" in normalized:
        return HTTPException(
            status_code=503,
            detail="ИИ не настроен: добавьте ZVENO_API_KEY в backend/.env и перезапустите сервер.",
        )
    if "http 401" in normalized or "http 403" in normalized:
        return HTTPException(
            status_code=503,
            detail="Zveno AI отклонил ключ доступа. Проверьте ZVENO_API_KEY в backend/.env.",
        )
    if "http 404" in normalized:
        return HTTPException(
            status_code=502,
            detail="Выбранная модель Zveno AI недоступна. Проверьте ZVENO_MODEL и список резервных моделей.",
        )
    if "http 400" in normalized:
        return HTTPException(
            status_code=502,
            detail="Zveno AI отклонил формат запроса. Проверьте модель и параметры генерации.",
        )
    if "http 402" in normalized:
        return HTTPException(
            status_code=402,
            detail="На балансе Zveno AI недостаточно средств. Пополните баланс аккаунта и повторите запрос.",
        )
    if "http 429" in normalized:
        if "free_model_platform_daily_limit_reached" in normalized:
            return HTTPException(
                status_code=429,
                detail=(
                    "Zveno исчерпал общий дневной лимит бесплатных моделей. "
                    "Резервные модели используют ту же квоту; повторите запрос после её сброса."
                ),
            )
        return HTTPException(
            status_code=429,
            detail="Исчерпан лимит запросов к Zveno AI. Повторите запрос позже или проверьте квоту аккаунта.",
        )
    if "connection failed" in normalized:
        return HTTPException(
            status_code=502,
            detail="Не удалось подключиться к Zveno AI. Проверьте интернет-соединение backend-сервера.",
        )
    if "timed out" in normalized or "timeout" in normalized:
        return HTTPException(
            status_code=504,
            detail="Zveno AI не ответил вовремя. Попробуйте повторить запрос позже.",
        )
    if "returned an empty response" in normalized:
        return HTTPException(
            status_code=502,
            detail="Модель ИИ вернула пустой ответ. Попробуйте повторить запрос.",
        )
    return HTTPException(
        status_code=502,
        detail="Zveno AI временно не смог обработать запрос. Попробуйте позже.",
    )


# ============ МОДЕЛИ ============

class AskRequest(BaseModel):
    message: str = Field(..., min_length=1)
    user_data: dict = Field(default_factory=dict)


class AskResponse(BaseModel):
    reply: str


class GeneratePlanRequest(BaseModel):
    user_data: dict


class GenerateMealPlanRequest(BaseModel):
    user_data: dict
    budget: int | None = None
    favorite_foods: str | None = None


# ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============

def calculate_nutrition_targets(user_data: dict) -> dict[str, int] | None:
    try:
        gender = user_data.get("gender")
        age = int(user_data["age"])
        height = float(user_data["height"])
        weight = float(user_data["weight"])
    except (KeyError, TypeError, ValueError):
        return None
    if (
        gender not in ("male", "female")
        or not 18 <= age <= 100
        or not math.isfinite(height)
        or not math.isfinite(weight)
        or not 50 <= height <= 250
        or not 20 <= weight <= 500
    ):
        return None

    activity_multipliers = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9,
    }
    bmr = 10 * weight + 6.25 * height - 5 * age + (5 if gender == "male" else -161)
    maintenance = bmr * activity_multipliers.get(user_data.get("activity_level"), 1.2)
    goal = user_data.get("goal")
    if goal in ("lose", "gain"):
        try:
            requested = float(user_data.get("target_change_kg_week") or 0) * 7700 / 7 / maintenance
        except (TypeError, ValueError):
            requested = 0
        adjustment = min(0.2, max(0.1, requested or (0.15 if goal == "lose" else 0.1)))
        calories = maintenance * (1 - adjustment if goal == "lose" else 1 + adjustment)
    else:
        calories = maintenance
    protein = round(weight * 1.8)
    fat = round(weight * 0.9)
    return {
        "bmr": round(bmr),
        "maintenance_calories": round(maintenance),
        "calories": round(calories),
        "protein": protein,
        "fat": fat,
        "carbs": max(0, round((calories - protein * 4 - fat * 9) / 4)),
    }


def format_user_data(user_data: dict) -> str:
    """Форматирует данные пользователя для вставки в промт."""
    lines = []
    lines.append(f"- Пол: {user_data.get('gender', 'не указан')}")
    lines.append(f"- Возраст: {user_data.get('age', 'не указан')}")
    lines.append(f"- Рост: {user_data.get('height', 'не указан')} см")
    lines.append(f"- Вес: {user_data.get('weight', 'не указан')} кг")
    lines.append(f"- Цель: {user_data.get('goal', 'не указана')}")
    lines.append(f"- Уровень активности: {user_data.get('activity_level', user_data.get('activity', 'не указан'))}")
    lines.append(f"- Навыки: Сила={user_data.get('strength', 0)}, Выносливость={user_data.get('endurance', 0)}, Сон={user_data.get('sleep', 0)}, Питание={user_data.get('nutrition', 0)}")
    lines.append(f"- Фаза цикла: {user_data.get('cycle_phase', 'не указана')}")
    lines.append(f"- Религиозные ограничения: {user_data.get('religion', 'нет')}")
    lines.append(f"- Инвентарь: {user_data.get('equipment', 'нет')}")
    lines.append(f"- Уровень подготовки: {user_data.get('training_level', 'не указан')}")
    lines.append(f"- Целевой вес: {user_data.get('target_weight', 'не указан')} кг")
    lines.append(f"- Тренировок в неделю: {user_data.get('days_per_week', 'не указано')}")
    lines.append(f"- Опыт тренировок: {user_data.get('training_experience_months', 'не указан')} месяцев")
    lines.append(f"- 1ПМ в жиме/приседе/становой: {user_data.get('bench_press_1rm', 'не указан')} / {user_data.get('squat_1rm', 'не указан')} / {user_data.get('deadlift_1rm', 'не указан')} кг")
    lines.append(f"- Максимум отжиманий/подтягиваний: {user_data.get('pushups_max', 'не указан')} / {user_data.get('pullups_max', 'не указан')}")
    lines.append(f"- Длительность тренировки: {user_data.get('workout_duration_minutes', 'не указана')} мин")
    lines.append(f"- Фокусные мышцы: {user_data.get('focus_muscles', user_data.get('weak_muscles', []))}")
    lines.append(f"- Травмы и ограничения: {user_data.get('injuries', [])}")
    lines.append(f"- Медицинские ограничения: {user_data.get('health_restrictions', 'не указаны')}")
    lines.append(f"- Питание/аллергии/ограничения: {user_data.get('nutrition_notes', 'не указаны')}")
    lines.append(f"- Приёмов пищи в день: {user_data.get('meals_per_day', 'не указано')}")
    lines.append(f"- Желаемое изменение веса: {user_data.get('target_change_kg_week', 'не указано')} кг/неделю")
    if user_data.get("activity_work"):
        lines.append(f"- Бытовая активность: {user_data['activity_work']}")
    if user_data.get("training_history"):
        lines.append(f"- Предыдущий тренировочный опыт: {user_data['training_history']}")
    lines.append(f"- Личная цель и предпочтения: {user_data.get('personal_goal', '')}; {user_data.get('preferences', '')}")
    coach_data = user_data.get("coach_data")
    if isinstance(coach_data, dict):
        lines.append(
            "- Дополнительные ответы тренеру: "
            f"цель={coach_data.get('main_goal', 'не указана')}; "
            f"фокус={coach_data.get('focus_type', 'не указан')}; "
            f"приоритет={coach_data.get('priority', 'не указан')}; "
            f"длительность={coach_data.get('workout_duration', 'не указана')} мин"
        )
    nutrition_targets = calculate_nutrition_targets(user_data)
    if nutrition_targets:
        lines.append(
            "- Расчётный ориентир по Миффлину—Сан Жеору: "
            f"поддержание={nutrition_targets['maintenance_calories']} ккал; "
            f"цель={nutrition_targets['calories']} ккал; "
            f"Б={nutrition_targets['protein']} г, Ж={nutrition_targets['fat']} г, "
            f"У={nutrition_targets['carbs']} г. Это оценка, не медицинское назначение."
        )
    context = user_data.get("context")
    if isinstance(context, str) and context.strip():
        lines.append(f"- Контекст предыдущих тренировок и диалога: {context.strip()[:6000]}")
    return "\n".join(lines)


def parse_workout_plan(reply: str) -> dict:
    """Extract and validate a plan object even if the model wraps JSON in prose or Markdown."""
    for start, character in enumerate(reply):
        if character != "{":
            continue

        depth = 0
        in_string = False
        escaped = False
        for end in range(start, len(reply)):
            current = reply[end]
            if in_string:
                if escaped:
                    escaped = False
                elif current == "\\":
                    escaped = True
                elif current == '"':
                    in_string = False
                continue

            if current == '"':
                in_string = True
            elif current == "{":
                depth += 1
            elif current == "}":
                depth -= 1
                if depth == 0:
                    try:
                        plan = json.loads(reply[start:end + 1])
                    except json.JSONDecodeError:
                        break
                    if not isinstance(plan, dict):
                        break
                    structure = plan.get("structure")
                    try:
                        days_per_week = int(plan.get("days_per_week") or 3)
                    except (TypeError, ValueError):
                        break
                    if (
                        not isinstance(structure, dict)
                        or len(structure) != 4
                        or any(
                            not isinstance(days, dict)
                            or any(
                                not isinstance(exercises, list)
                                or any(not isinstance(exercise, str) for exercise in exercises)
                                for exercises in days.values()
                            )
                            for days in structure.values()
                        )
                        or not 1 <= days_per_week <= 7
                    ):
                        break
                    plan["days_per_week"] = days_per_week
                    return plan

    raise ValueError("AI returned no valid four-week workout plan")


# ============ ЭНДПОИНТЫ ============

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ai")
async def ai_health() -> dict[str, str | bool | int]:
    """Report provider configuration without exposing credentials."""
    return provider_status()


@app.post("/ai/ask", response_model=AskResponse)
@app.post("/api/ai/ask", response_model=AskResponse, include_in_schema=False)
async def ai_ask(body: AskRequest) -> AskResponse:
    """
    Основной чат с ИИ.
    """
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Сообщение не может быть пустым")

    # Формируем системный промт для чата
    profile = format_user_data(body.user_data)
    system_prompt = f"""
Ты — персональный фитнес-наставник и диетолог в приложении Ascend. Твоя задача — давать **конкретные, персонализированные советы** по питанию и тренировкам, строго следуя научным рекомендациям.

### 1. Данные пользователя:
{profile}

### 2. Источники (в порядке приоритета):
- Рекомендации ВОЗ по питанию и физической активности
- Руководство ACSM по спортивной нутрициологии (2025-2026)
- Методические рекомендации Минздрава РФ (ФИЦ питания и биотехнологии)
- Гарвардская тарелка питания (Harvard Healthy Eating Plate)

### 3. Базовые принципы:
- Белки: 1.6–2.2 г на 1 кг веса (для активных)
- Жиры: 20–35% от калорийности (минимум 0.7 г/кг)
- Углеводы: остальная часть калорийности (от 40%)
- Клетчатка: минимум 25–30 г в день
- Вода: 30–40 мл на 1 кг веса

### 4. Адаптация под цели:
- Похудение: дефицит 15–20% от нормы, акцент на белок и клетчатку.
- Набор массы: профицит 10–15%, акцент на углеводы и белок.
- Поддержание: ровно по норме.

### 5. Учёт религиозных ограничений:
- Халяль: исключить свинину, алкоголь, желатин из свинины.
- Кошер: исключить смешение мяса и молока, свинину, морепродукты без чешуи.

### 6. Формат ответа:
- Отвечай коротко и по делу (2–4 абзаца).
- Никаких общих фраз («важно помнить», «стоит отметить», «возможно»).
- Если просят рацион: выдай план на день с весами и КБЖУ.
- Если просят тренировку: выдай список упражнений с подходами и повторениями.
- Если не знаешь — честно скажи и предложи обратиться к врачу.
- Всегда добавляй дисклеймер: «Перед началом проконсультируйтесь с врачом».

### 7. Корректировка по запросу:
- Если пользователь говорит «убери жим лёжа» или «добавь углеводов» — скорректируй и объясни изменения.
"""

    try:
        reply = await ask_ai(message, system_prompt)
        return AskResponse(reply=reply)
    except (ValueError, RuntimeError) as exc:
        logger.warning("AI request failed: %s", exc)
        raise _ai_provider_error(exc) from exc
    except Exception:
        logger.exception("Unexpected error in /ai/ask")
        raise HTTPException(
            status_code=500,
            detail="Внутренняя ошибка сервера. Попробуйте позже.",
        )


@app.post("/plans/generate")
@app.post("/api/plans/generate", include_in_schema=False)
async def generate_plan(request: GeneratePlanRequest):
    return await _generate_plan_response(request.user_data)


async def _generate_plan_response(
    user_data: dict,
    progress: Callable[[dict], None] | None = None,
) -> dict:
    try:
        plan = await generate_reviewed_plan(user_data, progress)
        structure = plan["structure"]
        return {
            "goal": str(plan.get("goal") or "Персональный план"),
            "weeks": len(structure),
            "days_per_week": plan["days_per_week"],
            "structure": structure,
            "progression": str(plan.get("progression") or ""),
            "review_status": plan.get("review_status", "approved"),
            "review_cycles": plan.get("review_cycles", 1),
            "review_notes": plan.get("review_notes", []),
        }
    except HTTPException:
        raise
    except (ValueError, RuntimeError) as exc:
        logger.warning("Workout plan AI request failed: %s", exc)
        raise _ai_provider_error(exc) from exc


@app.post("/plans/generate/stream")
@app.post("/api/plans/generate/stream", include_in_schema=False)
async def generate_plan_stream(request: GeneratePlanRequest):
    """Stream real generation and review stages to the frontend using server-sent events."""
    events: asyncio.Queue[dict | None] = asyncio.Queue()

    async def run_generation() -> None:
        try:
            plan = await _generate_plan_response(
                request.user_data,
                lambda event: events.put_nowait(event),
            )
            events.put_nowait({"stage": "complete", "plan": plan})
        except HTTPException as exc:
            events.put_nowait({
                "stage": "error",
                "status_code": exc.status_code,
                "detail": exc.detail,
            })
        except Exception:
            logger.exception("Unexpected error in streamed workout plan generation")
            events.put_nowait({
                "stage": "error",
                "status_code": 500,
                "detail": "Внутренняя ошибка при создании плана.",
            })
        finally:
            events.put_nowait(None)

    async def event_stream():
        task = asyncio.create_task(run_generation())
        try:
            while True:
                try:
                    event = await asyncio.wait_for(events.get(), timeout=15)
                except TimeoutError:
                    yield ": generation-in-progress\n\n"
                    continue
                if event is None:
                    break
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/meal-plans/generate")
@app.post("/api/meal-plans/generate", include_in_schema=False)
async def generate_meal_plan(request: GenerateMealPlanRequest):
    """
    Генерация персонализированного рациона питания на день.
    """
    user_data = request.user_data
    budget = request.budget
    favorite_foods = request.favorite_foods

    profile = format_user_data(user_data)
    budget_text = f"Бюджет на неделю: {budget} руб." if budget else ""
    favorite_text = f"Любимые продукты: {favorite_foods}" if favorite_foods else ""

    system_prompt = f"""
Ты — диетолог. Составь сбалансированный рацион питания на день для пользователя.

Данные пользователя:
{profile}

Дополнительно:
{budget_text}
{favorite_text}

Правила:
- Учитывай цель (похудеть/набрать массу/поддержать).
- Учитывай религиозные ограничения (халяль/кошер).
- Используй продукты, доступные в средней полосе России.
- Рацион должен включать: завтрак, обед, ужин, 2 перекуса.
- Для каждого приёма пищи укажи: название блюда, вес порции (г), КБЖУ.
- Суммарное КБЖУ за день должно соответствовать норме пользователя.
- Если указан бюджет, подбери продукты, чтобы уложиться в него.
- Если указаны любимые продукты, включи их в рацион.
- Ответ выдай в виде читаемого меню.
- Всегда добавляй дисклеймер: «Перед началом проконсультируйтесь с врачом».
"""

    try:
        reply = await ask_ai("Составь рацион питания на день.", system_prompt)
        return {"meal_plan": reply}
    except (ValueError, RuntimeError) as exc:
        logger.warning("AI meal-plan generation failed: %s", exc)
        raise _ai_provider_error(exc) from exc
    except Exception:
        logger.exception("Unexpected error in AI meal-plan generation")
        raise HTTPException(
            status_code=500,
            detail="Не удалось сформировать план питания из-за внутренней ошибки сервера.",
        )


# ================================================
@app.get("/products/search", include_in_schema=False)
@app.get("/api/products/search")
async def search_products(query: str, mcp_url: str | None = None):
    if len(query.strip()) < 2:
        return []
    try:
        return await asyncio.wait_for(search_vkusvill_products(query.strip(), mcp_url), timeout=12)
    except TimeoutError as exc:
        logger.warning("VkusVill product search exceeded the 12-second deadline")
        raise HTTPException(
            status_code=504,
            detail="Поиск ВкусВилл занял слишком много времени. Показаны локальные результаты.",
        ) from exc
    except VkusVillError as exc:
        message = str(exc)
        status_code = 503 if "требует авторизацию" in message or "авторизац" in message else 502
        logger.warning("VkusVill product search failed: %s", message)
        raise HTTPException(status_code=status_code, detail=message) from exc
