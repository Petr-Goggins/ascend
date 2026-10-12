import { useEffect, useMemo, useState } from 'react';
import { Activity, Award, Flame, Lock, Medal, Moon, Trophy, Dumbbell } from 'lucide-react';
import toast from 'react-hot-toast';
import TopBar from '@/components/TopBar';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';

type Workout = { exercise_name: string; weight: number; log_date: string };
type Achievement = { id: string; title: string; description: string; icon: typeof Award; unlocked: boolean };
type Assessment = { goal: string; training_level: string; weight: number | null; target_weight: number | null; squat_1rm: number | null } | null;
type WeightLog = { weight: number; log_date: string };

function calculateStreak(dates: string[]) {
  const unique = [...new Set(dates)].sort().reverse();
  if (!unique.length) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const latest = new Date(`${unique[0]}T00:00:00`);
  const age = Math.round((today.getTime() - latest.getTime()) / 86400000);
  if (age < 0 || age > 1) return 0;
  let streak = 0;
  let previous: Date | null = null;
  for (const value of unique) {
    const date = new Date(`${value}T00:00:00`);
    if (previous && Math.round((previous.getTime() - date.getTime()) / 86400000) !== 1) break;
    streak += 1;
    previous = date;
  }
  return streak;
}

function getActiveWeekDays(dates: string[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  return new Set(dates.filter((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date >= start && date <= today;
  })).size;
}

export default function AchievementsPage({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const user = useAuthStore((state) => state.user);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [sleepDays, setSleepDays] = useState(0);
  const [assessment, setAssessment] = useState<Assessment>(null);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [workoutResult, sleepResult, profileResult, weightResult] = await Promise.all([
          supabase.from('workout_logs').select('exercise_name, weight, log_date').eq('user_id', user.id).order('log_date', { ascending: true }),
          supabase.from('sleep_logs').select('log_date, hours').eq('user_id', user.id).gte('log_date', new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10)),
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('weight_logs').select('weight, log_date').eq('user_id', user.id).order('log_date', { ascending: true }),
        ]);
        if (workoutResult.error) throw workoutResult.error;
        if (sleepResult.error) throw sleepResult.error;
        if (profileResult.error) throw profileResult.error;
        if (weightResult.error) throw weightResult.error;
        setWorkouts((workoutResult.data ?? []) as Workout[]);
        setSleepDays(new Set((sleepResult.data ?? []).filter((item) => Number(item.hours) >= 8).map((item) => item.log_date)).size);
        setAssessment(profileResult);
        setWeightLogs((weightResult.data ?? []) as WeightLog[]);
      } catch (error) {
        console.error('Achievements load error', error);
        toast.error('Не удалось загрузить достижения');
      } finally { setLoading(false); }
    };
    void load();
  }, [user]);

  const achievements = useMemo<Achievement[]>(() => {
    const workoutDays = [...new Set(workouts.map((item) => item.log_date))];
    const streak = calculateStreak(workoutDays);
    const activeWeekDays = getActiveWeekDays(workoutDays);
    const level = assessment?.training_level ?? 'beginner';
    const workoutTarget = level === 'professional' ? 100 : level === 'advanced' ? 60 : level === 'intermediate' ? 30 : 10;
    const streakTarget = level === 'professional' || level === 'advanced' ? 5 : level === 'intermediate' ? 4 : 3;
    const streakUnit = streakTarget === 5 ? 'дней' : 'дня';
    const squats = workouts.filter((item) => item.exercise_name.toLowerCase().includes('присед')).map((item) => Number(item.weight) || 0);
    const squatBaseline = Number(assessment?.squat_1rm) || 0;
    const cardio = new Set(workouts.filter((item) => /бег|кардио|вел|скакал/.test(item.exercise_name.toLowerCase())).map((item) => item.log_date)).size;
    const stretching = new Set(workouts.filter((item) => /растяж|стретч|йог/.test(item.exercise_name.toLowerCase())).map((item) => item.log_date)).size;
    const latestWeight = weightLogs.at(-1)?.weight ?? assessment?.weight ?? null;
    const targetWeight = Number(assessment?.target_weight);
    const squatProgressDelta = squatBaseline
      ? Math.max(2.5, squatBaseline * (assessment?.goal === 'maintain' ? 0.025 : 0.05))
      : level === 'beginner' ? 2.5 : 5;
    const squatProgressTarget = squatBaseline + squatProgressDelta;
    const hasSquatProgress = squatBaseline
      ? Math.max(...squats, 0) >= squatProgressTarget
      : squats.some((weight, index) => squats.slice(index + 1).some((laterWeight) => laterWeight >= weight + squatProgressDelta));
    const reachedWeightGoal = Boolean(latestWeight && targetWeight && (
      assessment?.goal === 'lose' ? latestWeight <= targetWeight
        : assessment?.goal === 'gain' ? latestWeight >= targetWeight
          : Math.abs(latestWeight - targetWeight) <= targetWeight * 0.03
    ));
    return [
      { id: 'first', title: 'Первая тренировка', description: 'Добавьте запись тренировки', icon: Dumbbell, unlocked: workoutDays.length > 0 },
      { id: 'streak', title: `${streakTarget} ${streakUnit} подряд`, description: `Текущая серия: ${streak} дн. · цель для уровня «${level}»: ${streakTarget}`, icon: Flame, unlocked: streak >= streakTarget },
      { id: 'training-count', title: `${workoutTarget} тренировок`, description: `Тренировочных дней: ${workoutDays.length} · цель адаптирована под уровень`, icon: Trophy, unlocked: workoutDays.length >= workoutTarget },
      { id: 'squat', title: `Прогресс в приседе +${squatProgressDelta} кг`, description: squatBaseline ? `Цель: ${squatProgressTarget.toFixed(1)} кг (исходный 1ПМ ${squatBaseline} кг)` : `Прибавьте ${squatProgressDelta} кг к зарегистрированному приседу`, icon: Medal, unlocked: hasSquatProgress },
      { id: 'weight-goal', title: 'Цель по весу', description: assessment?.target_weight ? `Цель: ${assessment.target_weight} кг · последняя запись: ${latestWeight ?? 'нет'} кг` : 'Укажите целевой вес в анкете и записывайте динамику', icon: Target, unlocked: reachedWeightGoal },
      { id: 'cardio', title: 'Кардио-ритм', description: `Кардио-тренировок: ${cardio}`, icon: Activity, unlocked: cardio >= 10 },
      { id: 'stretch', title: 'Гибкость', description: `Тренировок на растяжку: ${stretching}`, icon: Award, unlocked: stretching >= 5 },
      { id: 'sleep', title: 'Восстановление', description: `Дней сна 8+: ${sleepDays}`, icon: Moon, unlocked: sleepDays >= 14 },
      { id: 'hundred', title: '100 тренировочных дней', description: `Дней с тренировками: ${workoutDays.length}`, icon: Trophy, unlocked: workoutDays.length >= 100 },
      { id: 'push', title: 'Сила Push', description: 'Закройте первый навык Push', icon: Dumbbell, unlocked: workouts.some((item) => /жим|отжим/.test(item.exercise_name.toLowerCase())) },
      { id: 'pull', title: 'Сила Pull', description: 'Закройте первый навык Pull', icon: Dumbbell, unlocked: workouts.some((item) => /тяга|подтяг/.test(item.exercise_name.toLowerCase())) },
      { id: 'legs', title: 'Сильные ноги', description: 'Запишите присед или выпады', icon: Dumbbell, unlocked: workouts.some((item) => /присед|выпад/.test(item.exercise_name.toLowerCase())) },
      { id: 'core', title: 'Крепкий корпус', description: 'Запишите планку или пресс', icon: Activity, unlocked: workouts.some((item) => /планк|пресс/.test(item.exercise_name.toLowerCase())) },
      { id: 'active', title: 'Активная неделя', description: `Дней с тренировкой за последние 7 дней: ${activeWeekDays}`, icon: Flame, unlocked: activeWeekDays >= 3 },
      { id: 'discipline', title: 'Дисциплина', description: '10 записей тренировок', icon: Award, unlocked: workouts.length >= 10 },
    ];
  }, [assessment, sleepDays, weightLogs, workouts]);

  const unlocked = achievements.filter((item) => item.unlocked).length;
  return <div><TopBar title="Достижения" onOpenSidebar={onOpenSidebar} /><main className="mx-auto max-w-5xl space-y-6 p-4 lg:p-8 animate-slide-up"><header className="card-modern flex items-center justify-between"><div><h2 className="text-xl font-bold text-text">Реальный прогресс</h2><p className="mt-1 text-sm text-text-secondary">{loading ? 'Загрузка данных...' : unlocked ? `${unlocked} из ${achievements.length} открыто` : 'Начните первую тренировку, чтобы открыть достижения'}</p></div><div className="text-right"><p className="text-3xl font-bold text-accent-blue">{unlocked} / {achievements.length}</p><p className="text-xs text-text-tertiary">без фиктивных значений</p></div></header><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{achievements.map((achievement) => { const Icon = achievement.unlocked ? achievement.icon : Lock; return <article key={achievement.id} className={`card p-5 ${achievement.unlocked ? 'border-accent-green/40' : 'opacity-60'}`}><div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${achievement.unlocked ? 'bg-accent-green/15 text-accent-green' : 'bg-bg-tertiary text-text-tertiary'}`}><Icon size={24} /></div><h3 className="font-bold text-text">{achievement.title}</h3><p className="mt-1 text-xs text-text-secondary">{achievement.description}</p></article>; })}</div></main></div>;
}
