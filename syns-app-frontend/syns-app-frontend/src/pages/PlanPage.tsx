import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useProfileStore } from '@/store/profileStore';
import { useCoachStore } from '@/store/coachStore';
import { Calendar, Dumbbell, Loader2, Clock, Target, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import QuestionnaireRequired from '@/components/QuestionnaireRequired';
import { isQuestionnaireComplete } from '@/lib/questionnaire';

type PlanProgress = {
  stage: string;
  attempt: number;
  max_attempts: number;
  message: string;
  estimated_remaining_seconds: number;
};

export default function PlanPage({ onOpenSidebar: _onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const { profile, fetchProfile } = useProfileStore();
  const { coachData } = useCoachStore();
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<PlanProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!generating || !generationProgress) return;
    const timer = window.setInterval(() => {
      setGenerationProgress((current) => current
        ? { ...current, estimated_remaining_seconds: Math.max(0, current.estimated_remaining_seconds - 1) }
        : current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [generating, generationProgress?.stage, generationProgress?.attempt]);

  // Загружаем профиль и анкету при монтировании
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      try {
        await fetchProfile(user.id);
        await loadPlan();
      } catch (error) {
        console.error('Workout plan load failed', error);
        setLoadError('Не удалось загрузить план. Проверьте подключение к Supabase.');
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [user]);

  const loadPlan = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('user_plans')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    setPlan(data ? { ...data, current_week: 1 } : null);
  };

  const generatePlan = async () => {
    if (!user) return;
    if (profile?.id !== user.id || !isQuestionnaireComplete(profile)) {
      toast.error('Сначала заполните анкету тренера');
      return;
    }
    setGenerating(true);
    setGenerationProgress({
      stage: 'connecting',
      attempt: 1,
      max_attempts: 3,
      message: 'Подключаю генератор плана',
      estimated_remaining_seconds: 150,
    });
    const requestController = new AbortController();
    const requestTimeout = window.setTimeout(() => requestController.abort(), 240_000);
    try {
      const apiUrl = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
      const response = await fetch(`${apiUrl}/plans/generate/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_data: {
            gender: profile.gender,
            age: profile.age,
            height: profile.height,
            weight: profile.weight,
            target_weight: profile.target_weight,
            goal: profile.goal,
            personal_goal: profile.personal_goal,
            activity_level: profile.activity_level,
            activity_work: profile.activity_work,
            nutrition_notes: profile.nutrition_notes,
            meals_per_day: profile.meals_per_day,
            target_change_kg_week: profile.target_change_kg_week,
            health_restrictions: profile.health_restrictions,
            training_level: profile.training_level,
            training_experience_months: profile.training_experience_months,
            training_history: profile.training_history,
            bench_press_1rm: profile.bench_press_1rm,
            squat_1rm: profile.squat_1rm,
            deadlift_1rm: profile.deadlift_1rm,
            pushups_max: profile.pushups_max,
            pullups_max: profile.pullups_max,
            workout_duration_minutes: profile.workout_duration_minutes,
            days_per_week: profile.days_per_week,
            equipment: profile.inventory?.length ? profile.inventory : profile.equipment,
            injuries: profile.injuries,
            focus_muscles: profile.focus_muscles?.length ? profile.focus_muscles : profile.weak_muscles,
            preferences: profile.preferences,
            coach_data: coachData,
          },
        }),
        signal: requestController.signal,
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(errorPayload?.detail || `Сервис ИИ вернул HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('Сервис ИИ не открыл поток генерации');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let payload: {
        goal?: string;
        weeks?: number;
        days_per_week?: number;
        structure?: Record<string, Record<string, string[]>>;
        review_status?: string;
        review_cycles?: number;
        review_notes?: string[];
        progression?: string;
      } | null = null;
      let streamError: string | null = null;
      const processFrame = (frame: string) => {
        const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) return;
        const event = JSON.parse(dataLine.slice(5).trim()) as PlanProgress & {
          stage: string;
          plan?: typeof payload;
          detail?: string;
        };
        if (event.stage === 'error') {
          streamError = event.detail || 'Не удалось создать план';
        } else if (event.stage === 'complete') {
          payload = event.plan ?? null;
          setGenerationProgress({
            stage: 'complete',
            attempt: event.attempt || 3,
            max_attempts: event.max_attempts || 3,
            message: 'План готов, сохраняю его',
            estimated_remaining_seconds: 5,
          });
        } else {
          setGenerationProgress(event);
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        frames.forEach(processFrame);
        if (done) break;
      }
      if (buffer.trim()) processFrame(buffer);
      if (streamError) throw new Error(streamError);
      if (!payload?.structure || !Object.keys(payload.structure).length) {
        throw new Error('Сервис ИИ не вернул структуру плана');
      }
      const goalLabel = payload.goal || profile.personal_goal || 'Персональный план';
      const { data, error } = await supabase
        .from('user_plans')
        .insert({
          user_id: user.id,
          goal: goalLabel,
          structure: payload.structure,
          name: `Ascend: ${goalLabel}`,
          weeks: payload.weeks || Object.keys(payload.structure).length,
          days_per_week: payload.days_per_week || profile.days_per_week || 3,
          workout_type: 'strength',
          weak_muscles: profile.focus_muscles?.length ? profile.focus_muscles : profile.weak_muscles,
        })
        .select()
        .single();
      if (error) throw error;
      setPlan({
        ...data,
        current_week: 1,
        progression: payload.progression,
        review_status: payload.review_status,
        review_cycles: payload.review_cycles,
        review_notes: payload.review_notes,
      });
      toast.success('План тренировок создан');
    } catch (error) {
      console.error('Workout plan creation failed', error);
      const message = requestController.signal.aborted
        ? 'Генерация плана превысила 4 минуты. Попробуйте ещё раз позже.'
        : error instanceof Error ? `Не удалось создать план: ${error.message}` : 'Не удалось создать план';
      toast.error(message);
    } finally {
      window.clearTimeout(requestTimeout);
      setGenerating(false);
      setGenerationProgress(null);
    }
  };

  const estimatedWait = (seconds: number) => {
    if (seconds <= 0) return 'дольше обычного';
    if (seconds < 60) return `около ${seconds} сек`;
    return `около ${Math.ceil(seconds / 60)} мин`;
  };

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-accent-blue" size={32} /></div>;
  const questionnaireComplete = Boolean(user && profile?.id === user.id && isQuestionnaireComplete(profile));

  return (
    <div className="p-4 max-w-4xl mx-auto animate-fade-in">
      <div className="flex flex-wrap justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text flex items-center gap-2">
          <Dumbbell className="text-accent-blue" size={28} />
          Мой план
        </h1>
        {questionnaireComplete && <button
          onClick={() => void generatePlan()}
          disabled={generating}
          className="flex items-center gap-2 bg-accent-blue text-bg px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50 shadow-lg shadow-accent-blue/20 hover:shadow-accent-blue/40 transition-all"
        >
          {generating ? <Loader2 className="animate-spin" size={18} /> : <Dumbbell size={18} />}
          {generating ? 'Создание плана...' : 'Создать план'}
        </button>}
      </div>

      {!questionnaireComplete && <div className="mb-6"><QuestionnaireRequired /></div>}
      {loadError && <div role="alert" className="mb-4 rounded-lg border border-accent-red/30 bg-accent-red/10 p-3 text-sm text-text-secondary">{loadError}</div>}
      {generating && generationProgress && (
        <section aria-live="polite" className="mb-6 rounded-xl border border-accent-blue/30 bg-bg-secondary p-5 shadow-lg">
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 shrink-0 animate-spin text-accent-blue" size={20} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text">{generationProgress.message}</p>
              <p className="mt-1 text-sm text-text-secondary">
                Цикл проверки {generationProgress.attempt} из {generationProgress.max_attempts}
                {' · '}примерное ожидание: {estimatedWait(generationProgress.estimated_remaining_seconds)}
              </p>
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                {[
                  ['draft', 'Составление программы'],
                  ['critique', 'Проверка критиком'],
                  ['revision', 'Исправление замечаний'],
                ].map(([stage, label]) => {
                  const active = generationProgress.stage === stage;
                  const completed = stage === 'draft'
                    ? ['critique', 'revision', 'quality_check', 'complete'].includes(generationProgress.stage)
                    : stage === 'critique'
                      ? ['revision', 'quality_check', 'complete'].includes(generationProgress.stage)
                      : ['quality_check', 'complete'].includes(generationProgress.stage);
                  return (
                    <div
                      key={stage}
                      className={`rounded-lg border px-3 py-2 ${active ? 'border-accent-blue bg-accent-blue/10 text-accent-blue' : completed ? 'border-accent-green/30 text-accent-green' : 'border-border text-text-tertiary'}`}
                    >
                      {completed && !active ? '✓ ' : active ? '• ' : ''}{label}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {plan ? (
        <div className="space-y-6">
          {/* Карточка цели */}
          <div className="bg-bg-secondary p-5 rounded-xl border border-border shadow-lg transition-all hover:shadow-xl">
            <div className="flex items-center gap-3">
              <Target size={22} className="text-accent-blue" />
              <span className="text-text-secondary">Цель: <span className="text-text font-semibold">{plan.goal}</span></span>
              <span className="ml-auto text-xs bg-accent-green/10 text-accent-green px-3 py-1 rounded-full">
                {plan.review_status === 'approved'
                  ? `Проверен критиком · ${plan.review_cycles || 1} цикл.`
                  : plan.review_status === 'best_after_revisions'
                    ? 'Лучшая версия · 3 цикла'
                    : 'Активен'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-sm text-text-secondary">
              <Clock size={16} /> Неделя {plan.current_week || 1}
            </div>
            {plan.progression && <p className="mt-3 text-sm leading-relaxed text-text-secondary">{plan.progression}</p>}
            {plan.review_status === 'best_after_revisions' && plan.review_notes?.length > 0 && (
              <div className="mt-3 rounded-lg border border-accent-gold/30 bg-accent-gold/5 p-3 text-sm text-text-secondary">
                После трёх циклов критик оставил замечания: {plan.review_notes.join(' · ')}
              </div>
            )}
          </div>

          {/* Дни плана */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plan.structure && Object.entries(plan.structure).map(([week, days]: [string, any]) => (
              <div key={week} className="col-span-full">
                <h2 className="text-lg font-semibold text-text mb-3 flex items-center gap-2">
                  <Calendar size={20} className="text-accent-blue" />
                  {week}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(days).map(([day, exercises]: [string, any]) => (
                    <div key={day} className="bg-bg-secondary p-4 rounded-xl border border-border shadow-sm hover:shadow-md transition-all">
                      <p className="font-medium text-text flex items-center gap-2">
                        <Zap size={16} className="text-accent-gold" />
                        {day}
                      </p>
                      <ul className="mt-3 space-y-1.5">
                        {exercises.map((ex: string, i: number) => (
                          <li key={i} className="text-text-secondary text-sm flex items-start gap-2">
                            <span className="text-accent-blue">•</span>
                            {ex}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center text-text-secondary py-16 bg-bg-secondary rounded-xl border border-border shadow-lg animate-fade-in">
          <Dumbbell size={64} className="mx-auto mb-4 opacity-30 text-accent-blue" />
          <p className="text-xl font-medium text-text">У вас ещё нет плана</p>
          <p className="text-sm mt-1">Заполните анкету тренера, чтобы получить персонализированную программу</p>
          {questionnaireComplete && <button
            onClick={() => void generatePlan()}
            disabled={generating}
            className="mt-6 bg-accent-blue text-bg px-8 py-3 rounded-xl hover:opacity-90 transition shadow-lg shadow-accent-blue/20 flex items-center gap-2 mx-auto"
          >
            {generating ? <Loader2 className="animate-spin" size={18} /> : <Dumbbell size={18} />}
            {generating ? 'Создание плана...' : 'Создать план'}
          </button>}
        </div>
      )}
    </div>
  );
}