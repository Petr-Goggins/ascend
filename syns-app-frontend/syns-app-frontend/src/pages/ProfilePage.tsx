import { useEffect, useMemo, useState } from 'react';
import { Dumbbell, Flame, Moon, Target, type LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { calculateWaterNorm } from '@/lib/waterNorm';
import MuscleHeatmap from '@/components/MuscleHeatmap';
import GitHubCalendar from '@/components/GitHubCalendar';
import SkillTree from '@/components/SkillTree';

type Workout = {
  exercise_name: string;
  weight: number;
  reps: number;
  sets: number;
  log_date: string;
};
type Sleep = { hours: number; log_date: string };
type WorkoutSession = { duration: number; intensity: string };
type CalendarDay = { date: string; level: number; detail: string };
type ProfileSummary = {
  display_name: string | null;
  weight: number | null;
  target_weight: number | null;
  goal: string;
  squat_1rm: number | null;
  deadlift_1rm: number | null;
} | null;

const goalLabels: Record<string, string> = {
  lose: 'Снижение веса',
  gain: 'Набор массы',
  maintain: 'Поддержание веса',
};

function streak(dates: string[]) {
  const unique = [...new Set(dates)].sort().reverse();
  let total = 0;
  let previous: Date | null = null;

  for (const value of unique) {
    const date = new Date(`${value}T00:00:00`);
    if (previous && Math.round((previous.getTime() - date.getTime()) / 86400000) !== 1) break;
    total += 1;
    previous = date;
  }
  return total;
}

export default function ProfilePage({ onOpenSidebar: _onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileSummary>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [sleeps, setSleeps] = useState<Sleep[]>([]);
  const [sleepCalendar, setSleepCalendar] = useState<CalendarDay[]>([]);
  const [meals, setMeals] = useState<CalendarDay[]>([]);
  const [waterToday, setWaterToday] = useState(0);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);
      const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      try {
        const loadProfileData = () => Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('workout_logs').select('log_date, exercise_name, sets, reps, weight').eq('user_id', user.id).gte('log_date', from),
          supabase.from('workouts').select('duration, intensity').eq('user_id', user.id).gte('created_at', `${from}T00:00:00.000Z`),
          supabase.from('sleep_logs').select('log_date, hours').eq('user_id', user.id).gte('log_date', new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)),
          supabase.from('nutrition_logs').select('log_date, calories').eq('user_id', user.id).gte('log_date', from),
          supabase.from('water_logs').select('amount, created_at').eq('user_id', user.id).gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
          supabase.from('sleep_logs').select('log_date, hours').eq('user_id', user.id).gte('log_date', from),
        ]);
        let results = await loadProfileData();
        const unauthorized = results.some(({ error }) => error?.status === 401);
        if (unauthorized) {
          const { data, error } = await supabase.auth.refreshSession();
          if (error || data.session?.user.id !== user.id) {
            throw new Error('Сессия Supabase истекла. Войдите в аккаунт заново.');
          }
          results = await loadProfileData();
          if (results.some(({ error: queryError }) => queryError?.status === 401)) {
            throw new Error('Не удалось подтвердить сессию Supabase. Войдите в аккаунт заново.');
          }
        }
        const [
          { data: profileData, error: profileError },
          { data: workoutData, error: workoutError },
          { data: sessionData, error: sessionError },
          { data: sleepData, error: sleepError },
          { data: mealData, error: mealError },
          { data: waterData, error: waterError },
          { data: sleepCalendarData, error: sleepCalendarError },
        ] = results;
        if (profileError) throw profileError;
        if (workoutError) throw workoutError;
        if (sessionError) throw sessionError;
        if (sleepError) throw sleepError;
        if (mealError) throw mealError;
        if (waterError) throw waterError;
        if (sleepCalendarError) throw sleepCalendarError;

        setProfile({
          ...profileData,
          squat_1rm: profileData?.squat_1rm ?? null,
          deadlift_1rm: profileData?.deadlift_1rm ?? null,
        });
        setWorkouts((workoutData ?? []) as Workout[]);
        setSessions((sessionData ?? []) as WorkoutSession[]);
        setSleeps((sleepData ?? []) as Sleep[]);
        setWaterToday((waterData ?? []).reduce((total, item) => total + Number(item.amount || 0), 0));
        setSleepCalendar((sleepCalendarData ?? []).map((item) => ({
          date: item.log_date,
          level: Number(item.hours) >= 8 ? 3 : Number(item.hours) >= 6 ? 2 : 1,
          detail: `${item.hours} ч сна`,
        })));

        const mealMap = new Map<string, number>();
        mealData?.forEach((item) => {
          mealMap.set(item.log_date, (mealMap.get(item.log_date) ?? 0) + Number(item.calories || 0));
        });
        setMeals(
          [...mealMap].map(([date, calories]) => ({
            date,
            level: calories > 2400 ? 3 : calories < 1200 ? 1 : 0,
            detail: `${calories} ккал`,
          })),
        );
      } catch (error) {
        console.error('Profile load error', error);
        toast.error(error instanceof Error && error.message.includes('Сессия Supabase')
          ? error.message
          : 'Не удалось загрузить часть профиля');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [user]);

  const metrics = useMemo(() => {
    const estimatedMax = (pattern: RegExp, fallback: number | null | undefined) => {
      const loggedMax = workouts
        .filter((item) => pattern.test(item.exercise_name.toLowerCase()))
        .reduce((max, item) => Math.max(max, Number(item.weight || 0) * (1 + Number(item.reps || 0) / 30)), 0);
      const bestMax = loggedMax || Number(fallback) || 0;
      return bestMax ? `≈${Math.round(bestMax)} кг` : '—';
    };
    const squat1Rm = estimatedMax(/присед/, profile?.squat_1rm);
    const deadlift1Rm = estimatedMax(/станов|румын|тяга классич|deadlift/, profile?.deadlift_1rm);
    const recovery = sleeps.length
      ? sleeps.reduce((sum, item) => sum + Number(item.hours || 0), 0) / sleeps.length
      : 0;
    const caloriesBurned = profile?.weight && sessions.length
      ? sessions.reduce((total, session) => {
        const met = session.intensity === 'high' ? 7.5 : session.intensity === 'low' ? 3.5 : 5;
        return total + met * 3.5 * profile.weight / 200 * Math.max(0, Number(session.duration) || 0);
      }, 0)
      : 0;

    return {
      squat1Rm,
      deadlift1Rm,
      recovery: recovery ? `${recovery.toFixed(1)} ч` : '—',
      caloriesBurned: caloriesBurned ? `≈${Math.round(caloriesBurned)} ккал` : '—',
      streak: streak(workouts.map((item) => item.log_date)),
    };
  }, [profile?.deadlift_1rm, profile?.squat_1rm, profile?.weight, sessions, sleeps, workouts]);

  const waterNorm = calculateWaterNorm(profile?.weight);
  const profileGoal = profile?.goal ? goalLabels[profile.goal] ?? '—' : '—';
  const workoutDaysCount = new Set(workouts.map((item) => item.log_date)).size;
  const metricCards: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: Dumbbell, label: 'Силовой максимум в приседе (оценка 1ПМ)', value: metrics.squat1Rm },
    { icon: Dumbbell, label: 'Силовой максимум в становой тяге (оценка 1ПМ)', value: metrics.deadlift1Rm },
    { icon: Moon, label: 'Восстановление', value: metrics.recovery },
    { icon: Flame, label: 'Сожжено (оценка)', value: metrics.caloriesBurned },
  ];

  if (loading) return <div className="p-6 text-text-secondary">Загрузка профиля...</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 animate-fade-in">
      <header className="card-modern flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-accent-blue">Мой профиль</p>
          <h1 className="text-3xl font-bold text-text">
            {profile?.display_name?.trim() || user?.email?.split('@')[0] || 'Атлет'}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">{user?.email}</p>
        </div>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-blue/15 text-2xl font-bold text-accent-blue">
          {user?.email?.[0]?.toUpperCase() || 'А'}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card-modern">
          <p className="text-xs text-text-tertiary">Цель</p>
          <p className="mt-1 font-semibold text-text">{profileGoal}</p>
        </div>
        <div className="card-modern">
          <p className="text-xs text-text-tertiary">Тренировки за 30 дней</p>
          <p className="mt-1 font-semibold text-text">{workoutDaysCount || '—'}</p>
        </div>
        <div className="card-modern">
          <p className="text-xs text-text-tertiary">Серия тренировок</p>
          <p className="mt-1 flex items-center gap-2 font-semibold text-text">
            <Flame size={16} className="text-accent-orange" />
            {metrics.streak ? `${metrics.streak} дней` : '—'}
          </p>
        </div>
        <div className="card-modern">
          <p className="text-xs text-text-tertiary">Норма воды</p>
          <p className="mt-1 font-semibold text-text">
            {waterNorm ? `${waterToday} / ${waterNorm} мл сегодня` : 'Заполните вес в анкете'}
          </p>
        </div>
      </div>

      <section className="card-modern">
        <div className="mb-4 flex items-center gap-2">
          <Target size={18} className="text-accent-blue" />
          <h2 className="text-xl font-bold text-text">Метрики</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metricCards.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-bg/40 p-4">
              <Icon size={18} className="mb-3 text-accent-blue" />
              <p className="text-xs text-text-tertiary">{label}</p>
              <p className="mt-1 font-semibold text-text">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <MuscleHeatmap />
      <section className="card-modern">
        <div className="grid gap-4 lg:grid-cols-2">
          <GitHubCalendar
            title="Календарь тренировок"
            days={workouts.map((item) => ({
              date: item.log_date,
              level: 1,
              detail: `${item.exercise_name}: ${item.sets} подхода`,
            }))}
          />
          <GitHubCalendar title="Календарь питания" days={meals} mode="nutrition" />
          <GitHubCalendar title="Календарь сна" days={sleepCalendar} mode="nutrition" />
        </div>
      </section>
      <SkillTree />
    </div>
  );
}
