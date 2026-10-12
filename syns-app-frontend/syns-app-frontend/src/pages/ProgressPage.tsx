import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';

type Progress = { level: number; xp: number; progress: number };

export default function ProgressPage({ onOpenSidebar: _onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Progress>({ level: 1, xp: 0, progress: 0 });

  useEffect(() => {
    let active = true;
    const loadProgress = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data: logs, error } = await supabase
          .from('workout_logs')
          .select('completed_sets')
          .eq('user_id', user.id);
        if (error) throw error;
        if (!active) return;
        const xp = (logs ?? []).reduce((total, log) => total + 10 + (log.completed_sets?.length ?? 0) * 2, 0);
        setData({ level: Math.floor(xp / 100) + 1, xp, progress: xp % 100 });
      } catch (error) {
        console.error('Progress load error', error);
        toast.error('Не удалось загрузить прогресс');
        if (active) setData({ level: 1, xp: 0, progress: 0 });
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadProgress();
    return () => { active = false; };
  }, [user]);

  if (!user) return <div className="p-4">Пожалуйста, войдите в аккаунт.</div>;
  if (loading) return <div className="p-4">Загрузка...</div>;

  return (
    <div className="p-4 max-w-2xl">
      <h1 className="text-2xl font-bold text-text">Прогресс</h1>
      <div className="mt-4 bg-bg-secondary p-4 rounded-lg border border-border">
        <p className="text-text-secondary">Уровень: <span className="text-text font-bold">{data.level}</span></p>
        <p className="text-text-secondary">Очки опыта: <span className="text-text font-bold">{data.xp}</span></p>
        <p className="text-text-secondary">До следующего уровня: <span className="text-text font-bold">{data.progress}%</span></p>
        <div className="w-full bg-bg-tertiary rounded-full h-2 mt-2">
          <div className="bg-accent-blue h-2 rounded-full" style={{ width: `${data.progress}%` }} />
        </div>
      </div>
    </div>
  );
}
