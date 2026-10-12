import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Dumbbell, Target, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import TopBar from '@/components/TopBar';
import { useAuthStore } from '@/store/authStore';
import { useProfileStore } from '@/store/profileStore';
import { supabase } from '@/lib/supabase';
import { calculateNutritionTargets } from '@/lib/nutritionTargets';
import type { ActivityLevel, Gender } from '@/types';

const GOALS = [['lose', 'Похудение'], ['gain', 'Набор мышечной массы'], ['strength', 'Увеличение силы'], ['custom', 'Своя цель']] as const;
const LEVELS = [['beginner', 'Начинающий'], ['intermediate', 'Средний'], ['advanced', 'Продвинутый'], ['professional', 'Профессиональный']] as const;
const INVENTORY = ['Свой вес', 'Гантели', 'Штанга', 'Турник', 'Зал', 'Резинки'];
const INJURIES = [['none', 'Нет'], ['back', 'Спина'], ['knees', 'Колени'], ['shoulders', 'Плечи'], ['other', 'Другое']];
const MUSCLES = ['Грудные', 'Бицепс', 'Трицепс', 'Пресс', 'Ноги', 'Спина', 'Плечи'];
const ACTIVITY_LEVELS: [ActivityLevel, string][] = [['sedentary', 'Сидячая'], ['light', 'Лёгкая'], ['moderate', 'Средняя'], ['active', 'Высокая'], ['very_active', 'Очень высокая']];
const toggle = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
const optionalNumber = (value: string) => value.trim() ? Number(value) : null;

function Choice({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${active ? 'border-accent-blue bg-accent-blue/15 text-accent-blue' : 'border-border text-text-secondary hover:border-text-tertiary'}`}>{label}{active && <Check size={16} />}</button>;
}

function NumberField({ label, value, onChange, min = 0, max, step = 1 }: { label: string; value: string; onChange: (value: string) => void; min?: number; max?: number; step?: number }) {
  return <label className="block text-sm text-text-secondary">{label}<input type="number" min={min} max={max} step={step} className="input-field mt-2 w-full px-3 py-2.5 text-text" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export default function CoachPage({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const user = useAuthStore((state) => state.user);
  const { profile, updateProfile } = useProfileStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    goal: 'lose',
    customGoal: '',
    currentWeight: profile?.weight?.toString() ?? '',
    targetWeight: profile?.target_weight?.toString() ?? '',
    gender: profile?.gender ?? 'not_specified' as Gender,
    age: profile?.age?.toString() ?? '',
    height: profile?.height?.toString() ?? '',
    activityLevel: profile?.activity_level ?? 'moderate' as ActivityLevel,
    activityWork: profile?.activity_work ?? '',
    nutritionNotes: profile?.nutrition_notes ?? '',
    targetChangeKgWeek: profile?.target_change_kg_week?.toString() ?? '',
    bodyFat: profile?.body_fat_percent?.toString() ?? '',
    waist: profile?.waist_cm?.toString() ?? '',
    chest: profile?.chest_cm?.toString() ?? '',
    hip: profile?.hip_cm?.toString() ?? '',
    level: profile?.training_level ?? 'beginner',
    experienceMonths: profile?.training_experience_months?.toString() ?? '',
    benchMax: profile?.bench_press_1rm?.toString() ?? '',
    squatMax: profile?.squat_1rm?.toString() ?? '',
    deadliftMax: profile?.deadlift_1rm?.toString() ?? '',
    pullups: profile?.pullups_max?.toString() ?? '',
    inventory: profile?.inventory?.length ? profile.inventory : profile?.equipment ?? [],
    injury: 'none',
    muscles: profile?.focus_muscles?.length ? profile.focus_muscles : profile?.weak_muscles ?? [],
    personalGoal: profile?.personal_goal ?? '',
  });
  const weeks = useMemo(() => { const current = Number(form.currentWeight); const target = Number(form.targetWeight); return form.currentWeight.trim() && form.targetWeight.trim() && Number.isFinite(current) && Number.isFinite(target) && current > 0 && target > 0 && current !== target ? Math.max(1, Math.ceil(Math.abs(current - target) / 0.5)) : 0; }, [form.currentWeight, form.targetWeight]);
  const forecast = weeks ? new Date(Date.now() + weeks * 7 * 86400000).toLocaleDateString('ru-RU') : null;
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const nutritionTargets = useMemo(() => calculateNutritionTargets({
    gender: form.gender,
    age: optionalNumber(form.age),
    weight: optionalNumber(form.currentWeight),
    height: optionalNumber(form.height),
    activityLevel: form.activityLevel,
    goal: form.goal === 'lose' ? 'lose' : form.goal === 'gain' ? 'gain' : 'maintain',
    targetChangeKgWeek: optionalNumber(form.targetChangeKgWeek),
  }), [form.gender, form.age, form.currentWeight, form.height, form.activityLevel, form.goal, form.targetChangeKgWeek]);

  const save = async () => {
    if (!user) return;
    const currentWeight = form.currentWeight.trim() ? Number(form.currentWeight) : null;
    const targetWeight = form.targetWeight.trim() ? Number(form.targetWeight) : null;
    if (form.goal !== 'custom' && currentWeight === null) {
      toast.error('Укажите текущий вес');
      setStep(0);
      return;
    }
    if (form.goal !== 'custom' && targetWeight === null) {
      toast.error('Укажите целевой вес');
      setStep(0);
      return;
    }
    if ((currentWeight !== null && (!Number.isFinite(currentWeight) || currentWeight <= 0)) || (targetWeight !== null && (!Number.isFinite(targetWeight) || targetWeight <= 0))) {
      toast.error('Вес должен быть положительным числом');
      setStep(0);
      return;
    }
    const age = optionalNumber(form.age);
    const height = optionalNumber(form.height);
    if ((age !== null && (!Number.isInteger(age) || age < 1 || age > 100))
      || (height !== null && (!Number.isInteger(height) || height < 50 || height > 250))) {
      toast.error('Проверьте возраст и рост');
      setStep(0);
      return;
    }
    const numericAnswers = [
      optionalNumber(form.bodyFat),
      optionalNumber(form.waist),
      optionalNumber(form.chest),
      optionalNumber(form.hip),
      optionalNumber(form.experienceMonths),
      optionalNumber(form.targetChangeKgWeek),
      optionalNumber(form.benchMax),
      optionalNumber(form.squatMax),
      optionalNumber(form.deadliftMax),
      optionalNumber(form.pullups),
    ];
    if (numericAnswers.some((value) => value !== null && (!Number.isFinite(value) || value < 0))
      || (form.bodyFat.trim() && (Number(form.bodyFat) < 1 || Number(form.bodyFat) > 70))
      || (form.experienceMonths.trim() && !Number.isInteger(Number(form.experienceMonths)))
      || (form.targetChangeKgWeek.trim() && Number(form.targetChangeKgWeek) > 2)
      || (form.pullups.trim() && !Number.isInteger(Number(form.pullups)))
    ) {
      toast.error('Проверьте введённые замеры и тренировочные показатели');
      setStep(form.bodyFat || form.waist || form.chest || form.hip ? 0 : 1);
      return;
    }
    if (currentWeight !== null && targetWeight !== null && form.goal === 'lose' && targetWeight > currentWeight) {
      toast.error('При цели «Похудение» целевой вес должен быть ниже текущего');
      setStep(0);
      return;
    }
    if (currentWeight !== null && targetWeight !== null && form.goal === 'gain' && targetWeight < currentWeight) {
      toast.error('При цели «Набор массы» целевой вес должен быть выше текущего');
      setStep(0);
      return;
    }
    const customGoal = form.customGoal.trim();
    if (form.goal === 'custom' && !customGoal) {
      toast.error('Опишите свою цель');
      setStep(0);
      return;
    }
    setSaving(true);
    try {
      const personalGoals = [form.goal === 'custom' ? customGoal : '', form.goal === 'strength' ? 'Увеличение силы' : '', form.personalGoal.trim()].filter(Boolean);
      const goal = form.goal === 'lose' ? 'lose' : form.goal === 'gain' ? 'gain' : 'maintain';
      const saveError = await updateProfile(user.id, {
        ...(currentWeight !== null ? {
          weight: currentWeight,
          ...(!profile?.start_weight ? { start_weight: currentWeight } : {}),
        } : {}),
        ...(targetWeight !== null ? { target_weight: targetWeight } : {}),
        gender: form.gender,
        age,
        height,
        goal,
        activity_level: form.activityLevel,
        activity_work: form.activityWork.trim() || null,
        nutrition_notes: form.nutritionNotes.trim() || null,
        target_change_kg_week: optionalNumber(form.targetChangeKgWeek),
        body_fat_percent: optionalNumber(form.bodyFat),
        waist_cm: optionalNumber(form.waist),
        chest_cm: optionalNumber(form.chest),
        hip_cm: optionalNumber(form.hip),
        training_level: form.level,
        training_experience_months: optionalNumber(form.experienceMonths),
        bench_press_1rm: optionalNumber(form.benchMax),
        squat_1rm: optionalNumber(form.squatMax),
        deadlift_1rm: optionalNumber(form.deadliftMax),
        pullups_max: optionalNumber(form.pullups),
        equipment: form.inventory,
        inventory: form.inventory,
        weak_muscles: form.muscles,
        focus_muscles: form.muscles,
        injuries: form.injury === 'none' ? [] : [form.injury],
        personal_goal: personalGoals.length ? personalGoals.join('\n') : null,
        questionnaire_completed_at: new Date().toISOString(),
      });
      if (saveError) throw new Error(`Не удалось сохранить анкету: ${saveError}`);
      if (currentWeight !== null && currentWeight !== profile?.weight) {
        const { error: historyError } = await supabase.from('weight_logs').insert({ user_id: user.id, weight: currentWeight });
        if (historyError) {
          console.error('Initial weight history save failed', historyError);
          toast.error('Анкета сохранена, но историю веса записать не удалось');
        }
      }
      const bodyMeasurement = {
        user_id: user.id,
        weight: currentWeight,
        body_fat_percent: optionalNumber(form.bodyFat),
        waist_cm: optionalNumber(form.waist),
        chest_cm: optionalNumber(form.chest),
        hip_cm: optionalNumber(form.hip),
      };
      if (Object.values(bodyMeasurement).some((value) => value !== null && value !== user.id)) {
        const { error: measurementError } = await supabase.from('body_measurements').insert(bodyMeasurement);
        if (measurementError) {
          console.error('Initial body measurement save failed', measurementError);
          toast.error('Анкета сохранена, но замеры тела записать не удалось. Примените последнюю миграцию Supabase.');
        }
      }
      toast.success('Анкета сохранена');
      navigate('/dashboard');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Не удалось сохранить анкету'); } finally { setSaving(false); }
  };

  if (!user) return null;
  const StepIcon = [Target, Dumbbell, UserRound][step];
  return <div>
    <TopBar title="Анкета Ascend" onOpenSidebar={onOpenSidebar} />
    <main className="mx-auto max-w-2xl animate-slide-up p-4 lg:p-8">
      <div className="mb-6 flex gap-2">{[0, 1, 2].map((item) => <div key={item} className={`h-1.5 flex-1 rounded-full ${item <= step ? 'bg-accent-blue' : 'bg-bg-tertiary'}`} />)}</div>
      <div className="mb-6 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-blue/15 text-accent-blue"><StepIcon size={20} /></div><div><p className="text-xs text-text-tertiary">Шаг {step + 1} из 3</p><h2 className="text-lg font-bold text-text">{['Цель и прогноз', 'Опыт и условия', 'Фокус развития'][step]}</h2></div></div>
      <section className="card space-y-5 p-6">
        {step === 0 && <>
          <div className="grid gap-2 sm:grid-cols-2">{GOALS.map(([value, label]) => <Choice key={value} active={form.goal === value} label={label} onClick={() => update('goal', value)} />)}</div>
          {form.goal === 'custom' && <input className="input-field w-full px-3 py-2.5 text-sm" placeholder="Опишите цель" value={form.customGoal} onChange={(event) => update('customGoal', event.target.value)} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-text-secondary">Пол для расчёта нормы<select className="input-field mt-2 w-full px-3 py-2.5 text-text" value={form.gender} onChange={(event) => update('gender', event.target.value as Gender)}><option value="not_specified">Не указан</option><option value="male">Мужской</option><option value="female">Женский</option></select></label>
            <NumberField label="Возраст, лет" value={form.age} max={100} onChange={(value) => update('age', value)} />
            <NumberField label="Рост, см" value={form.height} min={50} max={250} onChange={(value) => update('height', value)} />
            <NumberField label="Текущий вес, кг" value={form.currentWeight} min={1} step={0.1} onChange={(value) => update('currentWeight', value)} />
            <NumberField label="Целевой вес, кг" value={form.targetWeight} min={1} step={0.1} onChange={(value) => update('targetWeight', value)} />
            <label className="text-sm text-text-secondary">Бытовая активность<select className="input-field mt-2 w-full px-3 py-2.5 text-text" value={form.activityLevel} onChange={(event) => update('activityLevel', event.target.value as ActivityLevel)}>{ACTIVITY_LEVELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <NumberField label="Процент жира (если известен)" value={form.bodyFat} min={1} max={70} step={0.1} onChange={(value) => update('bodyFat', value)} />
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField label="Талия, см" value={form.waist} step={0.1} onChange={(value) => update('waist', value)} />
            <NumberField label="Грудь, см" value={form.chest} step={0.1} onChange={(value) => update('chest', value)} />
            <NumberField label="Бёдра, см" value={form.hip} step={0.1} onChange={(value) => update('hip', value)} />
          </div>
          <label className="block text-sm text-text-secondary">Характер работы и ходьбы<textarea className="input-field mt-2 min-h-16 w-full px-3 py-2.5 text-text" value={form.activityWork} onChange={(event) => update('activityWork', event.target.value)} placeholder="Например, сидячая работа и около 6 000 шагов" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Желаемое изменение веса, кг/неделю" value={form.targetChangeKgWeek} min={0.1} max={2} step={0.1} onChange={(value) => update('targetChangeKgWeek', value)} />
          </div>
          <label className="block text-sm text-text-secondary">Текущий рацион, аллергии, религиозные/личные ограничения<textarea className="input-field mt-2 min-h-16 w-full px-3 py-2.5 text-text" value={form.nutritionNotes} onChange={(event) => update('nutritionNotes', event.target.value)} /></label>
          <div className="rounded-lg border border-accent-blue/20 bg-accent-blue/10 p-4 text-sm text-text-secondary">
            {forecast && <>Ориентир достижения целевого веса: <strong className="text-text">{weeks} недель</strong> ({forecast}). </>}
            {nutritionTargets
              ? <>Расчёт по Миффлину—Сан Жеору: основной обмен {nutritionTargets.bmr} ккал, поддержание {nutritionTargets.maintenanceCalories} ккал. Ориентир на цель: <strong className="text-text">{nutritionTargets.calories} ккал · Б {nutritionTargets.protein} г · Ж {nutritionTargets.fat} г · У {nutritionTargets.carbs} г</strong>. Расчёт приблизительный, не медицинская рекомендация.</>
              : 'Для расчёта калорий укажите пол, возраст от 18 лет, рост и текущий вес.'}
          </div>
        </>}
        {step === 1 && <>
          <div><p className="mb-2 text-sm font-medium text-text-secondary">Уровень подготовки</p><div className="grid gap-2 sm:grid-cols-2">{LEVELS.map(([value, label]) => <Choice key={value} active={form.level === value} label={label} onClick={() => update('level', value)} />)}</div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Тренировочный стаж, месяцев" value={form.experienceMonths} max={1200} onChange={(value) => update('experienceMonths', value)} />
            <NumberField label="Подтягивания максимум, раз" value={form.pullups} max={200} onChange={(value) => update('pullups', value)} />
            <NumberField label="Жим лёжа, расчётный 1ПМ, кг" value={form.benchMax} step={0.5} max={600} onChange={(value) => update('benchMax', value)} />
            <NumberField label="Присед, расчётный 1ПМ, кг" value={form.squatMax} step={0.5} max={800} onChange={(value) => update('squatMax', value)} />
            <NumberField label="Становая тяга, расчётный 1ПМ, кг" value={form.deadliftMax} step={0.5} max={1000} onChange={(value) => update('deadliftMax', value)} />
          </div>
          <div><p className="mb-2 text-sm font-medium text-text-secondary">Инвентарь</p><div className="grid gap-2 sm:grid-cols-2">{INVENTORY.map((item) => <Choice key={item} active={form.inventory.includes(item)} label={item} onClick={() => update('inventory', toggle(form.inventory, item))} />)}</div></div>
          <div><p className="mb-2 text-sm font-medium text-text-secondary">Травмы и ограничения движений</p><div className="flex flex-wrap gap-2">{INJURIES.map(([value, label]) => <Choice key={value} active={form.injury === value} label={label} onClick={() => update('injury', value)} />)}</div></div>
        </>}
        {step === 2 && <>
          <div><p className="mb-2 text-sm font-medium text-text-secondary">Фокусные мышцы</p><div className="grid gap-2 sm:grid-cols-2">{MUSCLES.map((item) => <Choice key={item} active={form.muscles.includes(item)} label={item} onClick={() => update('muscles', toggle(form.muscles, item))} />)}</div></div>
          <label className="block text-sm text-text-secondary">Личная цель <span className="text-text-tertiary">(необязательно)</span><input className="input-field mt-2 w-full px-3 py-2.5 text-text" value={form.personalGoal} onChange={(event) => update('personalGoal', event.target.value)} /></label>
        </>}
      </section>
      <div className="mt-6 flex justify-between"><button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} className="btn-secondary flex items-center gap-2 px-4 py-2.5 disabled:opacity-30"><ArrowLeft size={17} /> Назад</button>{step < 2 ? <button type="button" onClick={() => setStep((current) => current + 1)} className="btn-primary flex items-center gap-2 px-6 py-2.5">Далее <ArrowRight size={17} /></button> : <button type="button" onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 px-6 py-2.5 disabled:opacity-50">{saving ? 'Сохраняем...' : 'Сохранить'} <Check size={17} /></button>}</div>
    </main>
  </div>;
}
