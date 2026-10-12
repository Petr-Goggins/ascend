import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import type { Profile } from '@/types';
import { supabase } from '../lib/supabase';
import { withRequestTimeout } from '@/lib/requestTimeout';
import { isMissingSchemaError } from '@/lib/supabaseErrors';
import toast from 'react-hot-toast';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { TrendingUp, Utensils, Dumbbell, Moon, Loader2, Sparkles, Plus, X } from 'lucide-react';

type Period = 'week' | 'month' | 'year';
type ChartRow = { date: string; [metric: string]: string | number };
type BodyMeasurement = {
  id: string;
  log_date: string;
  weight: number | null;
  body_fat_percent: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hip_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
};

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const measurementFields = [
  ['weight', 'Вес, кг'],
  ['body_fat_percent', 'Жир, %'],
  ['waist_cm', 'Талия, см'],
  ['chest_cm', 'Грудь, см'],
  ['hip_cm', 'Бёдра, см'],
  ['arm_cm', 'Рука, см'],
  ['thigh_cm', 'Бедро, см'],
] as const;

export default function ReportsPage({ onOpenSidebar: _onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [userProfile, setUserProfile] = useState<Partial<Profile>>({});
  const [period, setPeriod] = useState<Period>('week');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [calorieData, setCalorieData] = useState<ChartRow[]>([]);
  const [macroData, setMacroData] = useState<ChartRow[]>([]);
  const [weightData, setWeightData] = useState<ChartRow[]>([]);
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurement[]>([]);
  const [measurementData, setMeasurementData] = useState<ChartRow[]>([]);
  const [measurementError, setMeasurementError] = useState<string | null>(null);
  const [measurementOpen, setMeasurementOpen] = useState(false);
  const [measurementSaving, setMeasurementSaving] = useState(false);
  const [measurementForm, setMeasurementForm] = useState<Record<(typeof measurementFields)[number][0], string>>({
    weight: '', body_fat_percent: '', waist_cm: '', chest_cm: '', hip_cm: '', arm_cm: '', thigh_cm: '',
  });
  const [measurementDate, setMeasurementDate] = useState(today);
  const [workoutData, setWorkoutData] = useState<ChartRow[]>([]);
  const [sleepData, setSleepData] = useState<ChartRow[]>([]);
  const [weeklyAdvice, setWeeklyAdvice] = useState('');
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [summary, setSummary] = useState({
    totalCalories: 0,
    totalWorkouts: 0,
    avgSleep: 0,
    avgIntensity: 0,
  });

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, period]);

  const loadData = async () => {
    const userId = user?.id;
    if (!userId) return;
    setLoading(true);
    try {
      const now = new Date();
      const days = period === 'week' ? 6 : period === 'month' ? 29 : 364;
      const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
      const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const startStr = formatDate(startDate);
      const endStr = formatDate(now);

      // 1. Калории по дням
      const { data: meals, error: mealsError } = await supabase
        .from('nutrition_logs')
        .select('calories, proteins, fats, carbs, log_date')
        .eq('user_id', userId)
        .gte('log_date', startStr)
        .lte('log_date', endStr)
        .order('log_date', { ascending: true });
      if (mealsError) throw mealsError;

      const calorieMap: Record<string, number> = {};
      const macroMap: Record<string, { proteins: number; fats: number; carbs: number }> = {};
      meals?.forEach((m) => {
        const d = m.log_date;
        calorieMap[d] = (calorieMap[d] || 0) + (m.calories || 0);
        if (!macroMap[d]) macroMap[d] = { proteins: 0, fats: 0, carbs: 0 };
        macroMap[d].proteins += Number(m.proteins || 0);
        macroMap[d].fats += Number(m.fats || 0);
        macroMap[d].carbs += Number(m.carbs || 0);
      });
      const calData = Object.keys(calorieMap).map((d) => ({
        date: d.slice(5),
        calories: calorieMap[d],
      }));
      setCalorieData(calData);
      setMacroData(Object.entries(macroMap).map(([d, macros]) => ({ date: d.slice(5), ...macros })));

      // 2. Тренировки (подходы)
      const { data: workouts, error: workoutsError } = await supabase
        .from('workout_logs')
        .select('sets, reps, weight, intensity, log_date')
        .eq('user_id', userId)
        .gte('log_date', startStr)
        .lte('log_date', endStr)
        .order('log_date', { ascending: true });
      if (workoutsError) throw workoutsError;

      const workoutMap: Record<string, { sets: number; intensity: number; count: number; oneRm: number }> = {};
      workouts?.forEach((w) => {
        const d = w.log_date;
        if (!workoutMap[d]) workoutMap[d] = { sets: 0, intensity: 0, count: 0, oneRm: 0 };
        workoutMap[d].sets += w.sets || 0;
        workoutMap[d].intensity += w.intensity || 0;
        workoutMap[d].count += 1;
        workoutMap[d].oneRm = Math.max(workoutMap[d].oneRm, (Number(w.weight) || 0) * (1 + (Number(w.reps) || 0) / 30));
      });
      const wData = Object.keys(workoutMap).map((d) => ({
        date: d.slice(5),
        sets: workoutMap[d].sets,
        oneRm: Math.round(workoutMap[d].oneRm),
        intensity: Math.round(workoutMap[d].intensity / workoutMap[d].count),
      }));
      setWorkoutData(wData);

      // 3. Сон
      const { data: sleeps, error: sleepsError } = await supabase
        .from('sleep_logs')
        .select('hours, log_date')
        .eq('user_id', userId)
        .gte('log_date', startStr)
        .lte('log_date', endStr)
        .order('log_date', { ascending: true });
      if (sleepsError) throw sleepsError;

      const sleepMap: Record<string, number> = {};
      sleeps?.forEach((s) => {
        const d = s.log_date;
        sleepMap[d] = (sleepMap[d] || 0) + (s.hours || 0);
      });
      const sData = Object.keys(sleepMap).map((d) => ({
        date: d.slice(5),
        hours: sleepMap[d],
      }));
      setSleepData(sData);

      // 4. Вес
      const { data: weights, error: weightsError } = await supabase
        .from('weight_logs')
        .select('weight, log_date')
        .eq('user_id', userId)
        .gte('log_date', startStr)
        .lte('log_date', endStr)
        .order('log_date', { ascending: true });
      if (weightsError) throw weightsError;
      const { data: measurements, error: measurementsError } = await supabase
        .from('body_measurements')
        .select('id, log_date, weight, body_fat_percent, waist_cm, chest_cm, hip_cm, arm_cm, thigh_cm')
        .eq('user_id', userId)
        .gte('log_date', startStr)
        .lte('log_date', endStr)
        .order('log_date', { ascending: true });
      const schemaMissing = isMissingSchemaError(measurementsError);
      if (measurementsError && !schemaMissing) throw measurementsError;
      if (schemaMissing) {
        console.error('Body measurements schema is not up to date', measurementsError);
        setMeasurementError('Для замеров тела требуется применить миграцию 20261008090000_add_assessment_and_body_measurements.sql в Supabase.');
      } else {
        setMeasurementError(null);
      }
      const measuredRows = (schemaMissing ? [] : measurements ?? []) as BodyMeasurement[];
      setBodyMeasurements(measuredRows.slice().reverse());
      const weightRows = new Map((weights ?? []).map((item) => [item.log_date, Number(item.weight)]));
      measuredRows.forEach((item) => {
        if (item.weight !== null && !weightRows.has(item.log_date)) {
          weightRows.set(item.log_date, Number(item.weight));
        }
      });
      setWeightData([...weightRows].map(([date, weight]) => ({ date: date.slice(5), weight })));
      setMeasurementData(measuredRows.map((item) => ({
        date: item.log_date.slice(5),
        waist: Number(item.waist_cm) || 0,
        hips: Number(item.hip_cm) || 0,
        bodyFat: Number(item.body_fat_percent) || 0,
      })));

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('gender, age, height, weight, target_weight, goal, activity_level, training_level, days_per_week')
        .eq('id', userId)
        .maybeSingle();
      if (profileError) throw profileError;
      setUserProfile((profileData ?? {}) as Partial<Profile>);

      // 5. Сводка
      const totalCal = calData.reduce((acc, d) => acc + d.calories, 0);
      const totalW = new Set((workouts ?? []).map((item) => item.log_date)).size;
      const sleepDays = Object.values(sleepMap);
      const totalHours = sleepDays.reduce((acc, hours) => acc + hours, 0);
      const avgH = sleepDays.length ? totalHours / sleepDays.length : 0;
      const totalIntensity = workouts?.reduce((acc, w) => acc + (w.intensity || 0), 0) || 0;
      const avgInt = workouts?.length ? Math.round(totalIntensity / workouts.length) : 0;

      setSummary({
        totalCalories: Math.round(totalCal),
        totalWorkouts: totalW,
        avgSleep: Math.round(avgH * 10) / 10,
        avgIntensity: avgInt,
      });
    } catch (error) {
      console.error('Ошибка загрузки отчётов:', error);
      setLoadError('Не удалось загрузить статистику. Проверьте подключение и применённые миграции Supabase.');
      toast.error('Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  };

  const saveMeasurement = async () => {
    if (!user) return;
    const values = Object.fromEntries(measurementFields.map(([key]) => {
      const raw = measurementForm[key].trim();
      return [key, raw ? Number(raw) : null];
    })) as Record<(typeof measurementFields)[number][0], number | null>;
    const submitted = Object.values(values).filter((value): value is number => value !== null);
    if (!submitted.length) {
      toast.error('Укажите хотя бы один замер');
      return;
    }
    if (submitted.some((value) => !Number.isFinite(value) || value <= 0)) {
      toast.error('Все замеры должны быть положительными числами');
      return;
    }
    if (values.body_fat_percent !== null && values.body_fat_percent > 70) {
      toast.error('Процент жира должен быть не больше 70%');
      return;
    }

    setMeasurementSaving(true);
    try {
      const { error } = await supabase.from('body_measurements').insert({
        user_id: user.id,
        log_date: measurementDate,
        ...values,
      });
      if (error) throw error;
      if (values.weight !== null) {
        const { error: weightError } = await supabase.from('weight_logs').insert({
          user_id: user.id,
          log_date: measurementDate,
          weight: values.weight,
        });
        if (weightError) {
          console.error('Weight chart sync failed', weightError);
          toast.error('Замеры сохранены, но запись веса для графика не обновилась');
        }
      }
      setMeasurementOpen(false);
      setMeasurementForm({ weight: '', body_fat_percent: '', waist_cm: '', chest_cm: '', hip_cm: '', arm_cm: '', thigh_cm: '' });
      await loadData();
      toast.success('Замеры сохранены');
    } catch (error) {
      console.error('Body measurement save failed', error);
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить замеры');
    } finally {
      setMeasurementSaving(false);
    }
  };

  const generateWeeklyAdvice = async () => {
    setAdviceLoading(true);
    setWeeklyAdvice('');
    try {
      const apiUrl = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
      const periodLabel = period === 'week' ? 'последние 7 дней' : period === 'month' ? 'последние 30 дней' : 'последние 12 месяцев';
      const recordedDays = calorieData.length;
      const averageCalories = recordedDays ? Math.round(summary.totalCalories / recordedDays) : 0;
      const weightStart = weightData[0]?.weight;
      const weightEnd = weightData[weightData.length - 1]?.weight;
      const weightTrend = weightStart !== undefined && weightEnd !== undefined
        ? `Изменение веса: ${Number(weightEnd) - Number(weightStart)} кг`
        : 'Недостаточно записей веса для сравнения';
      const advice = await withRequestTimeout(async (signal) => {
        const response = await fetch(`${apiUrl}/ai/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Составь краткий отчёт за выбранный период — ${periodLabel} — и дай один практический совет. Данные за этот период: всего ${summary.totalCalories} ккал в дневнике; среднее ${averageCalories} ккал за ${recordedDays} дней с записями питания; тренировочных дней ${summary.totalWorkouts}; средний сон ${summary.avgSleep} ч за дни с записями; средняя интенсивность тренировок ${summary.avgIntensity}/10; ${weightTrend}. Это агрегированные данные, не средние за каждый день. Не выдумывай пропуски, тренды и медицинские выводы. Если данных недостаточно — прямо укажи это.`,
            user_data: userProfile,
          }),
          signal,
        });
        const payload = await response.json().catch(() => null) as { reply?: string; detail?: string } | null;
        if (!response.ok) throw new Error(payload?.detail || `HTTP ${response.status}`);
        if (!payload?.reply?.trim()) throw new Error('Пустой ответ от AI-сервера');
        return payload.reply.trim();
      }, 90_000, 'ИИ не подготовил отчёт за 90 секунд. Попробуйте ещё раз.');
      setWeeklyAdvice(advice);
    } catch (error) {
      console.error('Weekly AI report failed', error);
      toast.error(error instanceof Error ? error.message : 'Не удалось получить совет от ИИ');
    } finally {
      setAdviceLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-accent-blue" size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto animate-fade-in">
      <div className="flex flex-wrap justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text">Статистика</h1>
        <div className="flex gap-2 bg-bg-secondary p-1 rounded-lg border border-border">
          {(['week', 'month', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                period === p ? 'bg-accent-blue text-bg shadow' : 'text-text-secondary hover:text-text'
              }`}
            >
              {p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Год'}
            </button>
          ))}
        </div>
      </div>

      {loadError && <div role="alert" className="mb-6 rounded-lg border border-accent-red/30 bg-accent-red/10 p-3 text-sm text-text-secondary">{loadError}</div>}

      {/* Карточки сводки */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-bg-secondary p-4 rounded-xl border border-border shadow-sm flex items-center gap-4">
          <Utensils size={24} className="text-accent-orange" />
          <div>
            <p className="text-text-secondary text-xs">Калории</p>
            <p className="text-text font-bold">{summary.totalCalories} ккал</p>
          </div>
        </div>
        <div className="bg-bg-secondary p-4 rounded-xl border border-border shadow-sm flex items-center gap-4">
          <Dumbbell size={24} className="text-accent-green" />
          <div>
            <p className="text-text-secondary text-xs">Тренировки</p>
            <p className="text-text font-bold">{summary.totalWorkouts}</p>
          </div>
        </div>
        <div className="bg-bg-secondary p-4 rounded-xl border border-border shadow-sm flex items-center gap-4">
          <Moon size={24} className="text-accent-purple" />
          <div>
            <p className="text-text-secondary text-xs">Средний сон</p>
            <p className="text-text font-bold">{summary.avgSleep} ч</p>
          </div>
        </div>
        <div className="bg-bg-secondary p-4 rounded-xl border border-border shadow-sm flex items-center gap-4">
          <TrendingUp size={24} className="text-accent-blue" />
          <div>
            <p className="text-text-secondary text-xs">Интенсивность</p>
            <p className="text-text font-bold">{summary.avgIntensity}/10</p>
          </div>
        </div>
      </div>

      <section className="mb-6 rounded-xl border border-border bg-bg-secondary p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-text">Отчёты и рекомендации</h2>
            <p className="mt-1 text-xs text-text-tertiary">Добавляйте вес и замеры тела, чтобы отслеживать динамику</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setMeasurementOpen(true)} disabled={Boolean(measurementError)} title={measurementError ?? undefined} className="btn-secondary flex items-center gap-2 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50">
              <Plus size={16} /> Добавить отчёт
            </button>
            <button type="button" onClick={() => void generateWeeklyAdvice()} disabled={adviceLoading || loading || Boolean(loadError)} className="btn-primary flex items-center gap-2 px-4 py-2 disabled:opacity-50">
              {adviceLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Совет от ИИ за период
            </button>
          </div>
        </div>
        {measurementError && <p role="alert" className="mt-3 rounded-lg border border-accent-orange/30 bg-accent-orange/10 p-3 text-sm text-text-secondary">{measurementError}</p>}
        {weeklyAdvice && <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm leading-relaxed text-text-secondary">{weeklyAdvice}</p>}
      </section>

      {/* Графики */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Калории */}
        <div className="bg-bg-secondary p-4 rounded-xl border border-border shadow-sm">
          <h2 className="text-text font-semibold mb-3">Калории</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={calorieData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
              <XAxis dataKey="date" stroke="#8B949E" tick={{ fontSize: 10 }} />
              <YAxis stroke="#8B949E" />
              <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', color: '#E6EDF3' }} />
              <Bar dataKey="calories" fill="#F0883E" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Тренировки */}
        <div className="bg-bg-secondary p-4 rounded-xl border border-border shadow-sm">
          <h2 className="text-text font-semibold mb-3">Тренировки (подходы)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={workoutData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
              <XAxis dataKey="date" stroke="#8B949E" tick={{ fontSize: 10 }} />
              <YAxis stroke="#8B949E" />
              <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', color: '#E6EDF3' }} />
              <Bar dataKey="sets" fill="#3FB950" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-bg-secondary p-4 rounded-xl border border-border shadow-sm">
          <h2 className="text-text font-semibold mb-3">Расчётный 1ПМ</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={workoutData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
              <XAxis dataKey="date" stroke="#8B949E" tick={{ fontSize: 10 }} />
              <YAxis stroke="#8B949E" />
              <Tooltip />
              <Line type="monotone" dataKey="oneRm" name="кг" stroke="#4F46E5" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-bg-secondary p-4 rounded-xl border border-border shadow-sm">
          <h2 className="text-text font-semibold mb-3">Макронутриенты (г)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={macroData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
              <XAxis dataKey="date" stroke="#8B949E" tick={{ fontSize: 10 }} />
              <YAxis stroke="#8B949E" />
              <Tooltip />
              <Bar dataKey="proteins" name="Белки" fill="#4F46E5" />
              <Bar dataKey="fats" name="Жиры" fill="#F0883E" />
              <Bar dataKey="carbs" name="Углеводы" fill="#3FB950" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-bg-secondary p-4 rounded-xl border border-border shadow-sm">
          <h2 className="text-text font-semibold mb-3">Изменение веса</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={weightData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
              <XAxis dataKey="date" stroke="#8B949E" tick={{ fontSize: 10 }} />
              <YAxis stroke="#8B949E" />
              <Tooltip />
              <Line type="monotone" dataKey="weight" name="Вес, кг" stroke="#3FB950" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-bg-secondary p-4 rounded-xl border border-border shadow-sm">
          <h2 className="text-text font-semibold mb-3">Замеры тела</h2>
          {measurementData.some((row) => Number(row.waist) || Number(row.hips) || Number(row.bodyFat)) ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={measurementData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
                <XAxis dataKey="date" stroke="#8B949E" tick={{ fontSize: 10 }} />
                <YAxis stroke="#8B949E" />
                <Tooltip />
                <Line type="monotone" dataKey="waist" name="Талия, см" stroke="#F0883E" connectNulls />
                <Line type="monotone" dataKey="hips" name="Бёдра, см" stroke="#4F46E5" connectNulls />
                <Line type="monotone" dataKey="bodyFat" name="Жир, %" stroke="#3FB950" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="flex h-[220px] items-center justify-center text-sm text-text-tertiary">Добавьте замеры, чтобы увидеть динамику</p>}
        </div>

        {/* Сон */}
        <div className="bg-bg-secondary p-4 rounded-xl border border-border shadow-sm col-span-1 lg:col-span-2">
          <h2 className="text-text font-semibold mb-3">Сон (часы)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={sleepData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
              <XAxis dataKey="date" stroke="#8B949E" tick={{ fontSize: 10 }} />
              <YAxis stroke="#8B949E" domain={[0, 12]} />
              <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', color: '#E6EDF3' }} />
              <Line type="monotone" dataKey="hours" stroke="#BB86FC" strokeWidth={2} dot={{ fill: '#BB86FC' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

      </div>

      {bodyMeasurements.length > 0 && <section className="mt-6 rounded-xl border border-border bg-bg-secondary p-4">
        <h2 className="mb-3 font-semibold text-text">Последние замеры</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-text-tertiary"><tr><th className="pb-2">Дата</th>{measurementFields.map(([, label]) => <th key={label} className="pb-2">{label}</th>)}</tr></thead>
            <tbody>{bodyMeasurements.slice(0, 10).map((item) => <tr key={item.id} className="border-t border-border text-text-secondary">
              <td className="py-2">{new Date(`${item.log_date}T00:00:00`).toLocaleDateString('ru-RU')}</td>
              {measurementFields.map(([field]) => <td key={field} className="py-2">{item[field] ?? '—'}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </section>}

      {measurementOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMeasurementOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="measurement-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-bg-secondary p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 id="measurement-title" className="text-lg font-semibold text-text">Новый отчёт о замерах</h2><p className="mt-1 text-xs text-text-tertiary">Заполните только те показатели, которые измерили</p></div>
            <button type="button" onClick={() => setMeasurementOpen(false)} aria-label="Закрыть окно" className="text-text-tertiary hover:text-text"><X size={20} /></button>
          </div>
          <label className="mb-4 block text-sm text-text-secondary">Дата<input type="date" max={today()} value={measurementDate} onChange={(event) => setMeasurementDate(event.target.value)} className="input-field mt-2 w-full px-3 py-2.5 text-text" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            {measurementFields.map(([field, label]) => <label key={field} className="block text-sm text-text-secondary">{label}<input type="number" min="0.1" max={field === 'body_fat_percent' ? 70 : undefined} step="0.1" value={measurementForm[field]} onChange={(event) => setMeasurementForm((current) => ({ ...current, [field]: event.target.value }))} className="input-field mt-2 w-full px-3 py-2.5 text-text" /></label>)}
          </div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setMeasurementOpen(false)} className="btn-secondary px-4 py-2">Отмена</button><button type="button" onClick={() => void saveMeasurement()} disabled={measurementSaving} className="btn-primary px-4 py-2 disabled:opacity-50">{measurementSaving ? 'Сохраняем…' : 'Сохранить отчёт'}</button></div>
        </section>
      </div>}
    </div>
  );
}