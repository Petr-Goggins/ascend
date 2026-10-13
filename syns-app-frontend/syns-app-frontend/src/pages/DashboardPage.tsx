import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { isQuestionnaireComplete } from '@/lib/questionnaire';
import {
  Utensils,
  Droplet,
  Moon,
  Dumbbell,
  TrendingUp,
  Zap,
  Target,
} from 'lucide-react';
import SkillTree from '@/components/SkillTree';

const QUOTES = [
  { text: 'SpaceX провалился 9 раз, прежде чем достичь успеха.', author: 'Илон Маск' },
  { text: 'Успех — это сумма маленьких усилий, повторяемых день за днём.', author: 'Роберт Колльер' },
  { text: 'Не бойся быть слабой сегодня. Завтра ты станешь сильнее.', author: 'Народная мудрость' },
  { text: 'Пост — это не ограничение, а время для роста.', author: 'Духовная традиция' },
  { text: 'Отдых — часть тренировки.', author: 'Народная мудрость' },
];

export default function DashboardPage({ onOpenSidebar: _onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const quoteIndex = Math.floor(Date.now() / 86400000) % QUOTES.length;
  const [dailyQuote] = useState(QUOTES[quoteIndex]);
  const [questionnaireComplete, setQuestionnaireComplete] = useState(false);
  const [stats, setStats] = useState({
    weight: 0,
    calories: 0,
    proteins: 0,
    fats: 0,
    carbs: 0,
    water: 0,
    sleep: 0,
    workouts: 0,
    goal: 'Поддержание',
    progress: 0,
    streak: 0,
  });
  const [xp, setXp] = useState(0);
  const [addingWater, setAddingWater] = useState(false);
  const [waterAmount, setWaterAmount] = useState(250);

  useEffect(() => {
    if (!user) return;
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('display_name, weight, target_weight, goal, personal_goal')
          .eq('id', user.id)
          .maybeSingle();
        if (profileError) throw profileError;

        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const { data: meals, error: mealsError } = await supabase
          .from('nutrition_logs')
          .select('calories, proteins, fats, carbs')
          .eq('user_id', user.id)
          .eq('log_date', today);
        if (mealsError) throw mealsError;
        const totalCalories = meals?.reduce((sum, m) => sum + (m.calories || 0), 0) || 0;
        const macros = meals?.reduce((total, meal) => ({
          proteins: total.proteins + Number(meal.proteins || 0),
          fats: total.fats + Number(meal.fats || 0),
          carbs: total.carbs + Number(meal.carbs || 0),
        }), { proteins: 0, fats: 0, carbs: 0 }) ?? { proteins: 0, fats: 0, carbs: 0 };

        const { data: sleepEntries, error: sleepError } = await supabase
          .from('sleep_logs')
          .select('hours')
          .eq('user_id', user.id)
          .eq('log_date', today);
        if (sleepError) throw sleepError;
        const sleepHours = (sleepEntries ?? []).reduce((total, entry) => total + Number(entry.hours || 0), 0);

        const { count: workoutsCount, error: workoutsError } = await supabase
          .from('workout_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('log_date', today);
        if (workoutsError) throw workoutsError;

        const { data: workoutHistory, error: workoutHistoryError } = await supabase
          .from('workout_logs')
          .select('log_date, sets, completed_sets')
          .eq('user_id', user.id)
          .order('log_date', { ascending: false });
        if (workoutHistoryError) throw workoutHistoryError;
        const dates = [...new Set((workoutHistory ?? []).map((item) => item.log_date))];
        let streak = 0;
        let previous: Date | null = null;
        if (dates.length) {
          const todayDate = new Date(`${today}T00:00:00`);
          const latestDate = new Date(`${dates[0]}T00:00:00`);
          const latestAge = Math.round((todayDate.getTime() - latestDate.getTime()) / 86400000);
          if (latestAge >= 0 && latestAge <= 1) {
            for (const value of dates) {
              const date = new Date(`${value}T00:00:00`);
              if (previous && Math.round((previous.getTime() - date.getTime()) / 86400000) !== 1) break;
              streak += 1;
              previous = date;
            }
          }
        }
        setXp((workoutHistory ?? []).reduce((total, log) => total + 10 + (log.completed_sets?.length ?? 0) * 2, 0));

        const waterStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const waterEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const { data: waterData, error: waterError } = await supabase
          .from('water_logs')
          .select('amount_ml')
          .eq('user_id', user.id)
          .gte('created_at', waterStart.toISOString())
          .lt('created_at', waterEnd.toISOString());
        if (waterError) throw waterError;
        const totalWater = waterData?.reduce((sum, w) => sum + (w.amount_ml || 0), 0) || 0;

        setQuestionnaireComplete(isQuestionnaireComplete(profile ?? null));

        setStats({
          weight: profile?.weight || 0,
          calories: Math.round(totalCalories),
          ...macros,
          water: totalWater / 1000,
          sleep: sleepHours,
          workouts: workoutsCount || 0,
          goal: profile?.goal || 'Поддержание',
          progress: profile?.target_weight && profile.weight ? Math.max(0, Math.min(100, Math.round((1 - Math.abs(profile.weight - profile.target_weight) / Math.max(profile.weight, 1)) * 100))) : 0,
          streak,
        });
      } catch (error) {
        console.error('Dashboard load error', error);
        toast.error('Не удалось загрузить данные главной страницы');
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, [user]);

  const handleAddWater = async (amount: number) => {
    if (!user || addingWater || !Number.isInteger(amount) || amount <= 0 || amount % 50 !== 0) return;
    setAddingWater(true);
    try {
      const { error } = await supabase
        .from('water_logs')
        .insert({ user_id: user.id, amount_ml: amount });
      if (error) throw error;
      setStats((current) => ({ ...current, water: current.water + amount / 1000 }));
      toast.success(`Добавлено ${amount} мл воды`);
    } catch (error) {
      console.error('Water log insert failed', error);
      toast.error(error instanceof Error ? `Не удалось добавить воду: ${error.message}` : 'Не удалось добавить воду');
    } finally {
      setAddingWater(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const widgets = [
    { label: 'Калории', value: `${stats.calories} ккал`, icon: Utensils, color: 'text-accent-orange', bg: 'bg-accent-orange/10', path: '/nutrition' },
    { label: 'Сон', value: `${stats.sleep} ч`, icon: Moon, color: 'text-accent-purple', bg: 'bg-accent-purple/10', path: '/sleep' },
    { label: 'Подходов', value: `${stats.workouts} сегодня`, icon: Dumbbell, color: 'text-accent-green', bg: 'bg-accent-green/10', path: '/workouts' },
  ];

  return (
    <div className="p-4 max-w-4xl mx-auto animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text">Главная</h1>
        <span className="text-sm text-text-secondary">
          {new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      <section className="card-modern mt-4" aria-label="Потребление макронутриентов за сегодня">
        <p className="mb-3 text-sm text-text-secondary">Макронутриенты за сегодня</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <p className="text-sm text-text"><span className="font-bold">{Math.round(stats.proteins)} г</span><br /><span className="text-xs text-text-secondary">Белки</span></p>
          <p className="text-sm text-text"><span className="font-bold">{Math.round(stats.fats)} г</span><br /><span className="text-xs text-text-secondary">Жиры</span></p>
          <p className="text-sm text-text"><span className="font-bold">{Math.round(stats.carbs)} г</span><br /><span className="text-xs text-text-secondary">Углеводы</span></p>
        </div>
      </section>

      {!questionnaireComplete && (
        <div className="card-modern mt-6 border-accent-blue/30">
          <p className="text-sm text-text">Заполните анкету, чтобы получить персональный план тренировок.</p>
          <button type="button" onClick={() => navigate('/coach')} className="mt-2 text-sm font-semibold text-accent-blue">Заполнить анкету →</button>
        </div>
      )}

      <div className="card-modern mt-6 mb-6 bg-gradient-to-r from-accent-blue/5 to-transparent border-accent-blue/20 text-center py-4">
        <p className="text-text italic">"{dailyQuote.text}"</p>
        <p className="text-text-secondary text-sm">— {dailyQuote.author}</p>
      </div>

      <div className="card-modern mb-6 flex flex-wrap items-center justify-between bg-gradient-to-r from-accent-blue/10 to-transparent border-accent-blue/20">
        <div>
          <p className="text-text-secondary text-sm">Привет, {user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Пользователь'}!</p>
          <p className="text-text font-semibold text-lg">Цель: {{ lose: 'Похудение', gain: 'Набор массы', maintain: 'Поддержание', strength: 'Увеличение силы' }[stats.goal] || stats.goal}</p>
        </div>
        <div className="flex items-center gap-2">
          <Target size={20} className="text-accent-blue" />
          <span className="text-sm text-text-secondary">Вес: {stats.weight ? `${stats.weight} кг` : '—'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {widgets.map((widget) => (
          <div
            key={widget.label}
            onClick={() => navigate(widget.path)}
            className="card-modern cursor-pointer hover:border-accent-blue transition-all"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${widget.bg}`}>
                <widget.icon size={20} className={widget.color} />
              </div>
              <div>
                <p className="text-text-secondary text-xs">{widget.label}</p>
                <p className="text-text font-bold text-base">{widget.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <section className="card-modern border-accent-blue/20" aria-label="Выпитая вода за сегодня">
          <p className="flex items-center gap-2 text-sm text-text-secondary"><Droplet size={17} className="text-accent-blue" /> Выпито сегодня</p>
          <p className="mt-2 text-2xl font-bold text-text">{Math.round(stats.water * 1000).toLocaleString('ru-RU')} мл</p>
          <p className="mt-1 text-sm text-text-secondary">{stats.water.toFixed(2)} л</p>
        </section>

        <aside className="card-modern" aria-label="Добавить воду">
          <p className="mb-3 text-sm font-semibold text-text">Добавить воду</p>
          <form onSubmit={(event) => { event.preventDefault(); void handleAddWater(waterAmount); }} className="flex items-center gap-2">
            <label className="sr-only" htmlFor="dashboard-water-amount">Объём воды в миллилитрах</label>
            <input
              id="dashboard-water-amount"
              type="number"
              min="50"
              step="50"
              value={waterAmount || ''}
              onChange={(event) => setWaterAmount(event.target.value ? Number(event.target.value) : 0)}
              className="input-field w-28 px-3 py-2 text-right text-text"
              aria-label="Объём воды, мл, шаг 50 мл"
            />
            <span className="text-sm text-text-secondary">мл</span>
            <button type="submit" disabled={addingWater || waterAmount < 50 || waterAmount % 50 !== 0} className="btn-primary px-4 py-2 disabled:opacity-50">{addingWater ? 'Сохранение…' : 'Добавить'}</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {[150, 250, 500].map((amount) => <button key={amount} type="button" disabled={addingWater} onClick={() => void handleAddWater(amount)} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50">+{amount} мл</button>)}
          </div>
        </aside>
      </div>


      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card-modern">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Опыт за тренировки</span>
            <span className="text-sm font-semibold text-accent-gold">{xp.toLocaleString('ru-RU')} опыта</span>
          </div>
        </div>
        <button type="button" disabled={!questionnaireComplete} onClick={() => { localStorage.setItem('ascend-workout-start', String(Date.now())); navigate('/workouts'); }} className="btn-primary flex items-center justify-center gap-2 px-5 py-4 text-sm disabled:cursor-not-allowed disabled:opacity-50"><Dumbbell size={18} /> Начать тренировку</button>
      </div>

      <div className="mt-6"><SkillTree /></div>
    </div>
  );
}