import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Plus, Dumbbell, Trash2, ChevronLeft, ChevronRight, Search, Calendar, Zap, Pencil, X, Check, Circle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWorkoutStore } from '@/store/workoutStore';
import { useProfileStore } from '@/store/profileStore';
import { withRequestTimeout } from '@/lib/requestTimeout';

const EXERCISES = [
  'Приседания со штангой', 'Приседания с гантелями', 'Выпады с гантелями',
  'Становая тяга', 'Тяга гантели в наклоне', 'Жим лёжа',
  'Отжимания от пола', 'Подтягивания', 'Планка', 'Скручивания на пресс',
  'Болгарские выпады', 'Бег на месте', 'Скакалка',
  'Жим гантелей сидя', 'Разведение гантелей в стороны',
  'Сгибание рук с гантелями', 'Разгибание рук с гантелями за голову',
  'Велосипед (пресс)', 'Бёрпи', 'Растяжка',
];
type WorkoutSummary = { duration: number; sets: number; tonnage: number; aiReview: string; aiLoading: boolean };

export default function WorkoutLogPage({ onOpenSidebar: _onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const profile = useProfileStore((s) => s.profile);
  const activeWorkout = useWorkoutStore((state) => state.isActive);
  const startWorkout = useWorkoutStore((state) => state.startWorkout);
  const stopWorkout = useWorkoutStore((state) => state.stopWorkout);
  const hydrateWorkout = useWorkoutStore((state) => state.hydrate);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    exercise_name: '',
    sets: 3,
    reps: 10,
    weight: 0,
    duration_seconds: 0,
    distance_km: 0,
  });
  const [date, setDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [finishingWorkout, setFinishingWorkout] = useState(false);

  if (!user) {
    return <div className="p-4 text-text-secondary">Пожалуйста, войдите.</div>;
  }

  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  const changeDate = (days: number) => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + days);
    setDate(newDate);
  };

  useEffect(() => {
    hydrateWorkout();
  }, [hydrateWorkout]);

  useEffect(() => {
    loadLogs();
  }, [user, date]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('log_date', formatDate(date))
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      setLogs([]);
      toast.error(error instanceof Error ? error.message : 'Не удалось загрузить тренировки');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.exercise_name.trim()) return;
    try {
      const values = {
        user_id: user.id,
        exercise_name: form.exercise_name,
        sets: form.sets,
        reps: form.reps,
        weight: form.weight,
        duration_seconds: form.duration_seconds,
        distance_km: form.distance_km,
        log_date: formatDate(date),
      };
      const { error } = editingLogId
        ? await supabase.from('workout_logs').update(values).eq('id', editingLogId).eq('user_id', user.id)
        : await supabase.from('workout_logs').insert(values);
      if (error) throw error;
      setForm({ exercise_name: '', sets: 3, reps: 10, weight: 0, duration_seconds: 0, distance_km: 0 });
      setSearchTerm('');
      setEditingLogId(null);
      await loadLogs();
      toast.success(editingLogId ? 'Упражнение обновлено' : 'Упражнение добавлено');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось записать тренировку');
    }
  };

  const editLog = (log: { id: string; exercise_name: string; sets: number; reps: number; weight: number; duration_seconds?: number; distance_km?: number }) => {
    setEditingLogId(log.id);
    setForm({ exercise_name: log.exercise_name, sets: Number(log.sets), reps: Number(log.reps), weight: Number(log.weight), duration_seconds: Number(log.duration_seconds) || 0, distance_km: Number(log.distance_km) || 0 });
    setSearchTerm(log.exercise_name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleCompletedSet = async (log: { id: string; sets: number; completed_sets?: number[] }, setIndex: number) => {
    const completed = new Set(log.completed_sets ?? []);
    if (completed.has(setIndex)) completed.delete(setIndex);
    else completed.add(setIndex);
    const { error } = await supabase
      .from('workout_logs')
      .update({ completed_sets: [...completed].sort((a, b) => a - b) })
      .eq('id', log.id)
      .eq('user_id', user.id);
    if (error) {
      console.error('Completed set update failed', error);
      toast.error('Не удалось сохранить отметку подхода');
      return;
    }
    await loadLogs();
  };

  const finishWorkout = async () => {
    if (!user || finishingWorkout) return;
    const duration = useWorkoutStore.getState().elapsedTime;
    stopWorkout();
    const sets = logs.reduce((total, log) => total + (Number(log.sets) || 0), 0);
    const tonnage = logs.reduce((total, log) => total + (Number(log.weight) || 0) * (Number(log.reps) || 0) * (Number(log.sets) || 0), 0);
    setSummary({ duration, sets, tonnage, aiReview: '', aiLoading: true });
    setFinishingWorkout(true);
    try {
      const { error } = await supabase.from('workouts').insert({
        user_id: user.id,
        type: 'strength',
        duration: Math.round(duration / 60),
        intensity: 'medium',
      });
      if (error) throw error;
    } catch (error) {
      console.error('Workout session save failed', error);
      toast.error('Итог показан, но сессию не удалось сохранить');
    }
    try {
      const apiUrl = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
      const review = await withRequestTimeout(async (signal) => {
        const response = await fetch(`${apiUrl}/ai/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Оцени завершённую тренировку кратко и безопасно: длительность ${Math.round(duration / 60)} мин., ${sets} подходов, тоннаж ${Math.round(tonnage)} кг. Не выдумывай упражнения.`,
            user_data: {
              ...(profile?.id === user.id ? profile : {}),
              context: `Завершённая тренировка: ${Math.round(duration / 60)} мин., ${sets} подходов, тоннаж ${Math.round(tonnage)} кг.`,
            },
          }),
          signal,
        });
        const payload = await response.json().catch(() => null) as { reply?: string; detail?: string } | null;
        if (!response.ok) throw new Error(payload?.detail || `HTTP ${response.status}`);
        if (!payload?.reply?.trim()) throw new Error('Пустой ответ от AI-сервера');
        return payload.reply.trim();
      }, 90_000, 'ИИ не оценил тренировку за 90 секунд. Попробуйте позже.');
      setSummary((current) => current ? { ...current, aiReview: review, aiLoading: false } : current);
    } catch (error) {
      console.error('Workout AI review failed', error);
      setSummary((current) => current ? {
        ...current,
        aiReview: error instanceof Error ? `Оценка ИИ недоступна: ${error.message}` : 'Оценка ИИ недоступна.',
        aiLoading: false,
      } : current);
    } finally {
      setFinishingWorkout(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('workout_logs').delete().eq('id', id);
      if (error) throw error;
      await loadLogs();
      toast.success('Тренировка удалена');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить тренировку');
    }
  };

  const filteredExercises = EXERCISES.filter((ex) =>
    ex.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalSets = logs.reduce((acc, log) => acc + (log.sets || 0), 0);
  const totalWeight = logs.reduce((acc, log) => acc + ((log.weight || 0) * (log.sets || 0)), 0);

  return (
    <div className="p-4 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text flex items-center gap-2">
          <Dumbbell size={28} className="text-accent-blue" />
          Тренировки
        </h1>
        <div className="flex items-center gap-2"><span className="text-xs bg-accent-blue/10 text-accent-blue px-3 py-1 rounded-full">{logs.length} упр.</span><button type="button" disabled={finishingWorkout} onClick={() => { if (activeWorkout) void finishWorkout(); else { setSummary(null); startWorkout(); toast.success('Тренировка началась'); } }} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50">{activeWorkout ? 'Завершить' : 'Начать'}</button></div>
      </div>

      {summary && <section className="card-modern mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text">Итог тренировки</h2>
            <p className="mt-2 text-sm text-text-secondary">Длительность: {Math.floor(summary.duration / 60)} мин. · Подходы: {summary.sets} · Тоннаж: {Math.round(summary.tonnage).toLocaleString('ru-RU')} кг</p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-text-secondary">{summary.aiLoading ? 'ИИ анализирует тренировку…' : summary.aiReview}</p>
          </div>
          {!summary.aiLoading && <button type="button" aria-label="Закрыть итог тренировки" onClick={() => setSummary(null)} className="text-text-tertiary hover:text-text"><X size={18} /></button>}
        </div>
      </section>}

      {/* Дата — прозрачная, как в питании */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => changeDate(-1)}
          className="text-text-secondary hover:text-text p-1 transition"
        >
          <ChevronLeft size={22} />
        </button>
        <span className="text-text font-medium flex items-center gap-2">
          <Calendar size={16} className="text-text-tertiary" />
          {date.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={() => changeDate(1)}
          className="text-text-secondary hover:text-text p-1 transition"
        >
          <ChevronRight size={22} />
        </button>
        <button
          onClick={() => setDate(new Date())}
          className="text-xs text-accent-blue hover:underline"
        >
          Сегодня
        </button>
      </div>

      {/* Статистика за день */}
      {logs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-bg-secondary p-3 rounded-xl border border-border text-center">
            <p className="text-text-secondary text-xs">Подходов</p>
            <p className="text-text font-bold text-lg">{totalSets}</p>
          </div>
          <div className="bg-bg-secondary p-3 rounded-xl border border-border text-center">
            <p className="text-text-secondary text-xs">Общий вес (кг)</p>
            <p className="text-text font-bold text-lg">{totalWeight}</p>
          </div>
        </div>
      )}

      {/* Форма добавления */}
      <form onSubmit={handleAdd} className="bg-bg-secondary p-5 rounded-xl border border-border space-y-4 shadow-sm">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Поиск упражнения..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setForm((current) => ({ ...current, exercise_name: e.target.value }));
              if (filteredExercises.length === 1 && filteredExercises[0] === e.target.value) {
                setForm({ ...form, exercise_name: e.target.value });
              }
            }}
            className="input-field w-full pl-10 pr-3 py-2.5 rounded-lg"
          />
          {searchTerm && filteredExercises.length > 0 && (
            <ul className="absolute z-10 w-full bg-bg-secondary border border-border rounded-lg mt-1 max-h-40 overflow-y-auto">
              {filteredExercises.slice(0, 8).map((ex) => (
                <li
                  key={ex}
                  className="px-3 py-2 hover:bg-bg-tertiary cursor-pointer text-text text-sm"
                  onClick={() => {
                    setForm({ ...form, exercise_name: ex });
                    setSearchTerm(ex);
                  }}
                >
                  {ex}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Подходы</label>
            <input
              type="number"
              value={form.sets}
              onChange={(e) => setForm({ ...form, sets: Number(e.target.value) })}
              className="input-field w-full text-center py-2 rounded-lg"
              min="1"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Повторения</label>
            <input
              type="number"
              value={form.reps}
              onChange={(e) => setForm({ ...form, reps: Number(e.target.value) })}
              className="input-field w-full text-center py-2 rounded-lg"
              min="1"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Вес (кг)</label>
            <input
              type="number"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
              className="input-field w-full text-center py-2 rounded-lg"
              min="0"
              step="0.5"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-text-secondary">Длительность, сек.
            <input type="number" value={form.duration_seconds} onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })} className="input-field mt-1 w-full text-center py-2 rounded-lg" min="0" />
          </label>
          <label className="text-xs text-text-secondary">Дистанция, км
            <input type="number" value={form.distance_km} onChange={(e) => setForm({ ...form, distance_km: Number(e.target.value) })} className="input-field mt-1 w-full text-center py-2 rounded-lg" min="0" step="0.1" />
          </label>
        </div>

        <button
          type="submit"
          className="btn-primary w-full py-3 rounded-xl flex items-center justify-center gap-2 font-semibold"
        >
          {editingLogId ? <><Pencil size={18} /> Сохранить изменения</> : <><Plus size={18} /> Добавить упражнение</>}
        </button>
        {editingLogId && <button type="button" onClick={() => { setEditingLogId(null); setSearchTerm(''); setForm({ exercise_name: '', sets: 3, reps: 10, weight: 0, duration_seconds: 0, distance_km: 0 }); }} className="w-full text-sm text-text-secondary hover:text-text">Отменить редактирование</button>}
      </form>

      {/* Список записей */}
      <div className="mt-6 space-y-2">
        {loading ? (
          <p className="text-text-secondary text-center py-4">Загрузка...</p>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <Dumbbell size={48} className="mx-auto text-text-tertiary opacity-30 mb-3" />
            <p className="text-text-secondary">Нет тренировок за этот день</p>
            <p className="text-text-tertiary text-sm mt-1">Добавьте первую тренировку!</p>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="flex justify-between items-center bg-bg-secondary p-3 rounded-xl border border-border hover:border-accent-blue transition hover:shadow-sm group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent-blue/10 flex items-center justify-center">
                  <Zap size={16} className="text-accent-blue" />
                </div>
                <div>
                  <p className="font-semibold text-text">{log.exercise_name}</p>
                  <p className="text-text-secondary text-sm flex flex-wrap gap-1">
                    <span className="font-medium">Подходы:</span> {log.sets} &nbsp;•&nbsp;
                    <span className="font-medium">Повторения:</span> {log.reps} &nbsp;•&nbsp;
                    <span className="font-medium">Вес:</span> {log.weight} кг
                    {Number(log.duration_seconds) > 0 && <> &nbsp;•&nbsp; {log.duration_seconds} сек.</>}
                    {Number(log.distance_km) > 0 && <> &nbsp;•&nbsp; {log.distance_km} км</>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Подходы для ${log.exercise_name}`}>
                    {Array.from({ length: Number(log.sets) || 0 }, (_, index) => {
                      const completed = (log.completed_sets ?? []).includes(index);
                      return <button key={index} type="button" aria-pressed={completed} aria-label={`Подход ${index + 1}, ${completed ? 'выполнен' : 'не выполнен'}`} onClick={() => void toggleCompletedSet(log, index)} className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${completed ? 'border-accent-green/40 text-accent-green' : 'border-border text-text-tertiary'}`}>{completed ? <Check size={12} /> : <Circle size={12} />} {index + 1}</button>;
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" aria-label={`Изменить ${log.exercise_name}`} onClick={() => editLog(log)} className="text-text-secondary hover:text-accent-blue"><Pencil size={17} /></button>
                <button type="button" aria-label={`Удалить ${log.exercise_name}`} onClick={() => handleDelete(log.id)} className="text-text-secondary hover:text-accent-red"><Trash2 size={18} /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}