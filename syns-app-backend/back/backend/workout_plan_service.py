"""AI drafting, independent critique, and validation for generated workout plans."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable

from ai_service import ask_ai
from fastapi import HTTPException

logger = logging.getLogger(__name__)
MAX_REVIEW_CYCLES = 3
WEEKDAYS = ("Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье")


def _extract_json_object(reply: str) -> dict:
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
                        value = json.loads(reply[start:end + 1])
                    except json.JSONDecodeError:
                        break
                    if isinstance(value, dict):
                        return value
    raise ValueError("AI returned no JSON object")


def _parse_plan(reply: str) -> dict:
    plan = _extract_json_object(reply)
    structure = plan.get("structure")
    try:
        days_per_week = int(plan.get("days_per_week") or 3)
    except (TypeError, ValueError):
        raise ValueError("AI returned invalid days_per_week") from None
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
        raise ValueError("AI returned no valid four-week workout plan")
    plan["days_per_week"] = days_per_week
    return plan


def _exercise_categories(exercises: list[str]) -> set[str]:
    text = " ".join(exercises).lower()
    upper_body_text = re.sub(r"жим\s+(?:ногами|платформы)", "", text)
    categories = set()
    if any(word in upper_body_text for word in ("жим", "отжим", "push-up", "push up", "bench press", "chest press", "shoulder press")):
        categories.add("push")
    if (
        not any(word in text for word in ("трицепс", "на трицепс", "разгибание рук"))
        and any(word in text for word in ("тяга", "тяг", "подтяг", "греб", "row", "pull-up", "pulldown"))
    ):
        categories.add("pull")
    if any(
        word in text
        for word in (
            "присед", "выпад", "ягодич", "румын", "сгибание ног", "разгибание ног",
            "жим ног", "squat", "lunge", "deadlift", "leg press", "leg curl",
        )
    ):
        categories.add("legs")
    if any(word in text for word in ("пресс", "кор", "планка", "dead bug", "bird dog", "hollow", "pallof")):
        categories.add("core")
    return categories


def validate_workout_plan(plan: dict, user_data: dict) -> list[str]:
    """Reject plans that fail required schedule or beginner full-body coverage."""
    issues = []
    progression = str(plan.get("progression") or "").lower()
    progression_normalized = progression.replace("ё", "е")
    if not any(term in progression for term in ("двойн", "верхней границ", "double progression")):
        issues.append("Нужно явно описать двойную прогрессию и условие повышения веса")
    if not any(term in progression for term in ("разгруз", "делоад", "deload")):
        issues.append("Нужно описать разгрузочную четвёртую неделю")
    if not re.search(r"40\s*[-–]\s*50\s*(?:%|процент)", progression_normalized):
        issues.append("На разгрузочной неделе нужно снизить объём подходов на 40–50%")
    if not re.search(r"10\s*[-–]\s*20\s*(?:%|процент)", progression_normalized):
        issues.append("На разгрузочной неделе нужно снизить интенсивность на 10–20%")
    try:
        expected_days = max(1, min(7, int(user_data.get("days_per_week") or 3)))
    except (TypeError, ValueError):
        expected_days = 3
    structure = plan["structure"]
    first_week_sets = 0
    last_week_sets = 0
    for week_index, (week_name, days) in enumerate(structure.items()):
        week_sets = 0
        deload_named = "разгруз" in week_name.lower() or "deload" in week_name.lower()
        if week_index == len(structure) - 1 and not deload_named and not any(
            "разгруз" in exercise.lower() or "deload" in exercise.lower()
            for day_exercises in days.values()
            for exercise in day_exercises
        ) and "разгруз" not in progression and "deload" not in progression:
            issues.append("В структуре четвёртой недели должна быть явно указана разгрузка")
        for day_exercises in days.values():
            for exercise in day_exercises:
                if any(marker in exercise.lower() for marker in ("размин", "замин")):
                    continue
                sets_match = re.search(
                    r"\b(\d+)\s*(?:[×xх]\s*\d+|подход(?:а|ов)?\s*(?:по\s*)?\d+)",
                    exercise,
                    re.IGNORECASE,
                )
                if not sets_match:
                    continue
                week_sets += int(sets_match.group(1))
                if not re.search(r"\bRIR\s*[1-4]\b", exercise, re.IGNORECASE):
                    issues.append(f"{week_name}: каждому упражнению нужно указать RIR 2–3")
                if not re.search(
                    r"(?:отдых|пауза|перерыв).{0,40}\d+\s*[-–]\s*\d+",
                    exercise.lower(),
                ):
                    issues.append(f"{week_name}: каждому упражнению нужно указать диапазон отдыха")
        if week_index == 0:
            first_week_sets = week_sets
        if week_index == len(structure) - 1:
            last_week_sets = week_sets

    if first_week_sets <= 0 or last_week_sets <= 0 or not 0.5 <= last_week_sets / max(first_week_sets, 1) <= 0.6:
        issues.append("В четвёртой неделе число рабочих подходов должно быть ниже на 40–50% относительно первой")

    if plan["days_per_week"] != expected_days:
        issues.append(f"Частота тренировок должна быть {expected_days} дней в неделю согласно анкете")

    training_level = str(user_data.get("training_level") or "beginner").lower()
    is_beginner = any(value in training_level for value in ("beginner", "начинающ", "нович"))
    labels = {"push": "жим", "pull": "тяга", "legs": "ноги", "core": "кор"}
    for week_name, days in structure.items():
        listed_weekdays = [name for name in days if name in WEEKDAYS]
        if listed_weekdays != sorted(listed_weekdays, key=WEEKDAYS.index):
            issues.append(f"{week_name}: дни должны идти в календарном порядке")

        sessions = []
        for day_name, exercises in days.items():
            meaningful = [
                exercise
                for exercise in exercises
                if not any(marker in exercise.lower() for marker in ("размин", "замин"))
            ]
            if len(meaningful) >= 3:
                sessions.append((day_name, meaningful))
                normalized = " ".join(exercises).lower()
                if "размин" not in normalized:
                    issues.append(f"{week_name}, {day_name}: добавить разминку")
                if "замин" not in normalized and "мобил" not in normalized:
                    issues.append(f"{week_name}, {day_name}: добавить заминку")
                if not any(term in normalized for term in ("минут", " мин")):
                    issues.append(f"{week_name}, {day_name}: указать длительность тренировки")
        if len(sessions) != expected_days:
            issues.append(f"{week_name}: должно быть ровно {expected_days} тренировочных дня")

        if not is_beginner:
            continue
        if expected_days == 3 and len(sessions) == 3:
            workout_names = [name for name, _ in sessions]
            if workout_names != ["Понедельник", "Среда", "Пятница"]:
                issues.append(f"{week_name}: для новичка три тренировки должны идти Пн–Ср–Пт")
        leg_days = 0
        for day_name, exercises in sessions:
            categories = [_exercise_categories([exercise]) for exercise in exercises]
            present = set().union(*categories) if categories else set()
            missing = {"push", "pull", "legs", "core"} - present
            if missing:
                missing_labels = ", ".join(labels[item] for item in sorted(missing))
                issues.append(f"{week_name}, {day_name}: фулбоди для новичка — добавить {missing_labels}")
            if "legs" in present:
                leg_days += 1
            pushes = sum("push" in category for category in categories)
            pulls = sum("pull" in category for category in categories)
            if abs(pushes - pulls) > 1:
                issues.append(f"{week_name}, {day_name}: сбалансировать упражнения на жим и тягу")
        if leg_days < 2:
            issues.append(f"{week_name}: упражнения на ноги нужны минимум в двух тренировках")
    return list(dict.fromkeys(issues))


def _build_prompts(user_data: dict, user_profile: str) -> tuple[str, str]:
    training_level = str(user_data.get("training_level") or "beginner").lower()
    experience_months = user_data.get("training_experience_months")
    is_beginner = any(term in training_level for term in ("beginner", "начина", "нович")) or (
        isinstance(experience_months, (int, float)) and experience_months < 6
    )
    days_per_week = user_data.get("days_per_week", 3)
    level_rir = "3–4" if is_beginner else "2–3" if "intermediate" in training_level or "сред" in training_level else "1–2"
    creator = f"""
Ты — персональный тренер, составляющий безопасные программы тренировок.
Данные анкеты:
{user_profile}

Составь индивидуальный мезоцикл ровно на 4 недели (часть цикла 4–6 недель) и ровно {days_per_week} тренировочных дней в неделю.
Сначала проанализируй цель, тренировочный стаж, исходные силовые показатели, ограничения, инвентарь, число доступных дней и время тренировки. Не выдумывай отсутствующие данные и не назначай нагрузку, противопоказанную анкете.
Специфичность: для силы используй преимущественно 2–6 повторений, 2–3 рабочих подхода и нагрузку от 80% 1ПМ, только если достоверный 1ПМ указан; для гипертрофии — обычно 6–12 повторений и 3–5 подходов; для выносливости — 15–25+ повторений, обычно 50–65% 1ПМ, только если это можно рассчитать безопасно. Это ориентиры, не повод выдумывать проценты или рабочие веса. Порядок упражнений — от тяжёлых многосуставных к вспомогательным и изоляции.
Частота по стажу: новичок (до 6 месяцев) — 2–3 тренировки фулбоди; средний (6–24 месяца) — 3–4 дня, обычно верх/низ или тяга/жим/ноги; продвинутый (2+ года) — обычно 4–5 дней, допустим узкий сплит. Всегда соблюдай фактическое число дней анкеты. Каждая крупная группа должна получать нагрузку минимум дважды в неделю с учётом восстановления.
Недельный объём — отправная точка, а не обязательная квота: новичок 6–10, средний 10–16, продвинутый 12–20+ рабочих подходов на группу. Начинай с переносимого объёма, распределяй его по неделе, не превышай примерно 10–11 подходов на группу за одну тренировку и снижай объём, если не укладываешься во время или восстановление. Учитывай вспомогательную нагрузку многосуставных упражнений, не удваивая её.
Баланс: горизонтальная тяга и горизонтальный жим примерно 1:1; вертикальная тяга к вертикальному жиму около 1,5:1. Ноги: приседательное и тазобедренное шарнирное движение (например, румынская тяга) минимум дважды в неделю, если это допускают здоровье и инвентарь. Включай кор 2–3 раза в неделю и работу для стабильности плеч.
Периодизация новичка: первые 2–3 недели осваивай технику на лёгкой нагрузке; пример цикла — недели 1–3 с постепенным ростом усилия/объёма и неделя 4 разгрузочная. Если заданы пригодные 1ПМ и опыт, проценты можно использовать как ориентир; иначе расписывай нагрузку через повторения и RIR. На разгрузке сократи число рабочих подходов на 40–50% и интенсивность на 10–20%.
Прогрессия двойная: сначала все подходы достигают верхней границы повторений с целевым RIR и стабильной техникой; лишь затем добавляй вес (нижняя часть тела +2,5–5 кг, верхняя +1,25–2,5 кг, изоляция +1–2,5 кг). Не повышай вес автоматически каждую неделю. Укажи это правило и шаги в плане.
RIR для этой анкеты: {level_rir}. Не предписывай отказ новичкам; RIR 0 допустим только в последнем подходе изоляции у продвинутых.
Для базы указывай отдых по цели (сила 2–3 минуты, гипертрофия обычно 90–120 секунд; новичку не менее 90 секунд), для изоляции — 45–60 секунд при гипертрофии, для выносливости — 30–45 секунд. Указывай конкретный диапазон отдыха у каждого упражнения.
Обязательно адаптируй упражнения к инвентарю и травмам и предложи безопасную замену из доступного инвентаря для каждого движения. Не ставь упражнения с недоступным оборудованием или противопоказанной нагрузкой. При медицинских ограничениях избегай медицинских обещаний и рекомендуй согласовать нагрузку со специалистом.
В начале каждой тренировки укажи общую разминку 5–10 минут, динамическую мобилизацию и специфические разминочные подходы к первому базовому движению (примерно 50/70/80% только при известном рабочем весе). В конце — 5–10 минут лёгкой заминки/мобилизации. Соблюдай указанную длительность тренировки, сокращая вспомогательный объём, а не разминку.
Для каждого упражнения укажи подходы, диапазон повторений, RIR, отдых и краткую альтернативу в скобках.
Дни недели перечисляй в календарном порядке. Если частота три раза в неделю — планируй Пн/Ср/Пт для новичка и равномерно разнеси дни для остальных уровней.
Недели 1–3 должны прогрессировать без необоснованных скачков. Неделя 4 — разгрузка с уменьшением подходов на 40–50% и нагрузки на 10–20%.
В каждом тренировочном дне укажи разминку, заминку и длительность в пределах указанного времени.
Ответ — один JSON без Markdown. Формат: {{"goal":"цель","weeks":4,"days_per_week":3,"progression":"описание","structure":{{"Неделя 1":{{"Понедельник":["Разминка — 5–10 минут","Жим ... — 3×8–10, RIR 2–3, отдых 90–180 с","...","Заминка — 5 минут; тренировка около 45 минут"],"Вторник":["Отдых и восстановление"]}},"Неделя 2":{{}},"Неделя 3":{{}},"Неделя 4":{{}}}}}}
"""
    novice_reviewer = """
For beginners or experience under 6 months require full body (push, pull, legs, core each session), legs at least twice weekly, chronological days, and Mon/Wed/Fri for three weekly sessions.
""".strip() if is_beginner else """
Do not impose beginner full-body or Mon/Wed/Fri requirements on intermediate/advanced athletes; verify that split and recovery match their level and selected frequency.
""".strip()
    reviewer = f"""
Ты — отдельная роль: независимый строгий критик программ тренировок. Ты не составлял план.
Проверь план по анкете: безопасность при травмах, доступность инвентаря, уровень, цель и число дней.
{novice_reviewer}
Проверь соответствие повторений/подходов цели; при силовой цели — 2–6 повторений, 2–3 подхода и >=80% 1ПМ только при известном максимуме; гипертрофия — обычно 6–12 повторений и 3–5 подходов; выносливость — 15–25+ повторений. Не считай эти ориентиры абсолютными, если они противоречат уровню, безопасности или анкете.
Проверь, что крупные мышечные группы получают нагрузку минимум дважды в неделю, объём соответствует уровню (новичок 6–10, средний 10–16, продвинутый 12–20+ подходов на группу) и не превышает восстановление/лимит времени; проверяй горизонтальный жим/тягу примерно 1:1 и вертикальную тягу/жим примерно 1,5:1, ноги и кор.
Проверь порядок от базы к изоляции, двойную прогрессию, RIR уровня ({level_rir}), отдых, разминку с общей/динамической/специфической частями, заминку и длительность. Убедись, что инвентарь доступен, травмы учтены, замены безопасны и разгрузка недели 4 снижает объём на 40–50% и интенсивность на 10–20%.
Одобряй только при отсутствии существенных проблем безопасности и обязательных несоответствий; не требуй недоступных данных или оборудования и не придумывай отсутствующие недостатки.
Анкета:
{user_profile}
Верни только JSON: {{"approved":true,"issues":[]}} или {{"approved":false,"issues":["точное замечание"]}}.
"""
    return creator, reviewer


async def generate_reviewed_plan(
    user_data: dict,
    progress: Callable[[dict], None] | None = None,
) -> dict:
    """Generate, independently critique, and revise at most three times."""
    user_profile = "\n".join(
        f"- {key}: {value}"
        for key, value in user_data.items()
    )
    creator_prompt, reviewer_prompt = _build_prompts(user_data, user_profile)
    feedback: list[str] = []
    best_plan: dict | None = None
    best_issues: list[str] | None = None
    best_rank: tuple[int, int] | None = None

    def notify(stage: str, attempt: int, message: str) -> None:
        if progress:
            calls_left = (
                MAX_REVIEW_CYCLES * 2 - (attempt - 1) * 2
                if stage in ("draft", "revision")
                else (MAX_REVIEW_CYCLES - attempt) * 2
            )
            progress({
                "stage": stage,
                "attempt": attempt,
                "max_attempts": MAX_REVIEW_CYCLES,
                "message": message,
                "estimated_remaining_seconds": max(5, calls_left * 25),
            })

    for attempt in range(1, MAX_REVIEW_CYCLES + 1):
        notify(
            "draft" if attempt == 1 else "revision",
            attempt,
            "Составляю персональную программу" if attempt == 1 else "Исправляю замечания критика",
        )
        draft_request = (
            "Составь первую версию четырёхнедельного плана по требованиям."
            if attempt == 1
            else "Исправь весь план с учётом замечаний независимого критика. Верни полный JSON.\n"
            + "\n".join(f"- {item}" for item in feedback)
        )
        try:
            plan = _parse_plan(await ask_ai(draft_request, creator_prompt, max_tokens=5000))
        except ValueError:
            logger.warning("Workout plan draft %s had invalid JSON or schema", attempt)
            feedback = ["Верни полный валидный JSON: ровно 4 недели, дни и упражнения по заданной схеме."]
            continue

        mandatory_issues = validate_workout_plan(plan, user_data)
        if mandatory_issues:
            rank = (len(mandatory_issues), len(mandatory_issues))
            if best_rank is None or rank < best_rank:
                best_plan, best_issues, best_rank = plan, mandatory_issues, rank
            feedback = mandatory_issues
            logger.info(
                "Workout plan draft %s failed %s mandatory checks",
                attempt,
                len(mandatory_issues),
            )
            continue

        notify("critique", attempt, "Независимый ИИ-критик проверяет программу")
        try:
            review_text = await ask_ai(
                "Проведи независимую проверку и верни вердикт в JSON.\n"
                + json.dumps(plan, ensure_ascii=False),
                reviewer_prompt,
                max_tokens=1200,
            )
            review = _extract_json_object(review_text)
            critic_issues = review.get("issues")
            if not isinstance(critic_issues, list) or any(not isinstance(item, str) for item in critic_issues):
                raise ValueError("Critic returned invalid issues")
            approved = review.get("approved") is True and not critic_issues
        except ValueError:
            logger.warning("Workout plan critic failed or returned invalid review on cycle %s", attempt)
            critic_issues = ["Критик не вернул корректный вердикт; требуется повторная проверка."]
            approved = False

        issues = list(dict.fromkeys([*mandatory_issues, *critic_issues]))
        rank = (len(mandatory_issues), len(issues))
        if best_rank is None or rank < best_rank:
            best_plan, best_issues, best_rank = plan, issues, rank
        if approved and not mandatory_issues:
            notify("quality_check", attempt, "Критик одобрил план; проверяю обязательные условия")
            plan["review_status"] = "approved"
            plan["review_cycles"] = attempt
            return plan
        feedback = issues or ["Критик не одобрил план; проверь безопасность, баланс и прогрессию."]

    mandatory_issues = validate_workout_plan(best_plan, user_data) if best_plan else []
    if best_plan is None or mandatory_issues:
        logger.warning(
            "Workout plan generation exhausted %s cycles; mandatory issues: %s",
            MAX_REVIEW_CYCLES,
            "; ".join(mandatory_issues),
        )
        detail = "После трёх проверок не удалось создать план, соответствующий обязательным требованиям."
        if mandatory_issues:
            detail += " Исправьте анкету или попробуйте ещё раз. Замечания: " + "; ".join(mandatory_issues[:5])
        raise HTTPException(
            status_code=502,
            detail=detail,
        )
    notify("quality_check", MAX_REVIEW_CYCLES, "Выбираю лучшую прошедшую обязательные проверки версию")
    best_plan["review_status"] = "best_after_revisions"
    best_plan["review_cycles"] = MAX_REVIEW_CYCLES
    best_plan["review_notes"] = best_issues or []
    return best_plan
