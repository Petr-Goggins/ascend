import { useEffect, useMemo, useState } from 'react';
import Body, { type ExtendedBodyPart, type Slug } from 'react-muscle-highlighter';
import { RotateCcw } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';

const muscleLabels: Record<string, string> = { chest: 'Грудные', biceps: 'Бицепс', triceps: 'Трицепс', abs: 'Пресс', quadriceps: 'Квадрицепсы', 'upper-back': 'Спина', 'lower-back': 'Поясница', trapezius: 'Трапеции', deltoids: 'Плечи', forearm: 'Предплечья', gluteal: 'Ягодицы', hamstring: 'Бицепс бедра', calves: 'Икры' };
const muscleMapping: Record<string, Slug[]> = { жим: ['chest', 'triceps', 'deltoids'], груд: ['chest'], бицепс: ['biceps'], трицепс: ['triceps'], подтяг: ['upper-back', 'biceps'], тяга: ['upper-back', 'biceps'], присед: ['quadriceps', 'gluteal', 'hamstring'], выпад: ['quadriceps', 'gluteal'], планк: ['abs'], пресс: ['abs'], плеч: ['deltoids'], бег: ['calves', 'quadriceps'], растяж: ['hamstring'] };
const heatColors = ['#22c55e', '#eab308', '#ef4444'];

type Log = { exercise_name: string; weight: number; sets: number; reps: number };

export default function MuscleHeatmap() {
  const user = useAuthStore((state) => state.user);
  const [back, setBack] = useState(false);
  const [load, setLoad] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Slug | null>(null);

  useEffect(() => {
    if (!user) return;
    const from = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const loadLogs = async () => {
      try {
        const { data, error } = await supabase.from('workout_logs').select('exercise_name, weight, sets, reps, log_date').eq('user_id', user.id).gte('log_date', from);
        if (error) throw error;
        const next: Record<string, number> = {};
        (data as Log[] | null)?.forEach((log) => {
          const key = Object.keys(muscleMapping).find((item) => log.exercise_name.toLowerCase().includes(item));
          muscleMapping[key ?? '']?.forEach((muscle) => { next[muscle] = (next[muscle] ?? 0) + Number(log.weight || 0) * Number(log.sets || 0) * Number(log.reps || 0); });
        });
        setLoad(next);
      } catch (error) { console.error('Muscle heatmap error', error); }
    };
    void loadLogs();
  }, [user]);

  const maxLoad = Math.max(0, ...Object.values(load));
  const intensity = (slug: string) => maxLoad === 0 ? 0 : Math.min(3, Math.ceil((load[slug] ?? 0) / maxLoad * 3));
  const bodyData = useMemo<ExtendedBodyPart[]>(() => Object.keys(muscleLabels).map((slug) => ({ slug: slug as Slug, color: intensity(slug) ? heatColors[intensity(slug) - 1] : '#30363D', intensity: intensity(slug) || undefined })), [load, maxLoad]);
  const selectedLoad = selected ? Math.round(load[selected] ?? 0) : 0;

  return <section className="card-modern"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-accent-orange">7 дней</p><h2 className="text-xl font-bold text-text">Тепловая карта мышц</h2></div><button type="button" onClick={() => setBack((value) => !value)} className="btn-secondary flex items-center gap-2 px-3 py-2 text-xs"><RotateCcw size={14} /> {back ? 'Спереди' : 'Сзади'}</button></div><div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start"><div className="rounded-xl border border-border bg-bg/40 p-2" aria-label="Интерактивная анатомическая карта"><Body data={bodyData} side={back ? 'back' : 'front'} gender="male" scale={1.1} colors={heatColors} defaultFill="#30363D" defaultStroke="#6E7681" defaultStrokeWidth={0.5} onBodyPartPress={(part) => setSelected(part.slug ?? null)} /></div><div className="w-full space-y-2">{Object.entries(muscleLabels).map(([slug, label]) => <button type="button" key={slug} onClick={() => setSelected(slug as Slug)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${selected === slug ? 'bg-accent-blue/10 text-text' : 'text-text-secondary'}`}><span className="h-3 w-3 rounded-full" style={{ backgroundColor: intensity(slug) ? heatColors[intensity(slug) - 1] : '#30363D' }} /><span className="flex-1 text-left">{label}</span><span className="text-xs text-text-tertiary">{Math.round(load[slug] ?? 0)} ед.</span></button>)}{selected && <div className="rounded-lg border border-accent-blue/30 bg-accent-blue/10 p-3 text-xs text-text-secondary"><strong className="text-text">{muscleLabels[selected]}</strong>: {selectedLoad ? `${selectedLoad} ед. нагрузки за 7 дней` : 'нет данных за 7 дней'}</div>}</div></div></section>;
}
