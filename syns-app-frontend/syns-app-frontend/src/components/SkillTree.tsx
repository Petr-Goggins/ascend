import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Lock, X, Zap } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';

type SkillMetric = 'weight' | 'reps' | 'duration' | 'distance';
type SkillState = 'locked' | 'available' | 'unlocked';
type Skill = { title: string; target: number; metric: SkillMetric; terms: string[]; rank: string };
type Log = { exercise_name: string; weight: number | null; reps: number | null; duration_seconds: number | null; distance_km: number | null };
type Branch = { name: string; label: string; skills: Skill[] };
type SelectedSkill = { skill: Skill; progress: number; target: number; rank: string; state: SkillState };
type Assessment = { training_level: string; weight: number | null; pushups_max: number | null; pullups_max: number | null; squat_1rm: number | null; deadlift_1rm: number | null };

const branches: Branch[] = [
  { name: 'Push', label: 'Жим', skills: [
    { title: 'Отжимания', target: 5, metric: 'reps', terms: ['отжим'], rank: 'E' },
    { title: 'Отжимания — серия 10', target: 10, metric: 'reps', terms: ['отжим'], rank: 'D' },
    { title: 'Отжимания — серия 20', target: 20, metric: 'reps', terms: ['отжим'], rank: 'C' },
    { title: 'Отжимания — серия 30', target: 30, metric: 'reps', terms: ['отжим'], rank: 'B' },
    { title: 'Отжимания на брусьях', target: 10, metric: 'reps', terms: ['брусь'], rank: 'A' },
    { title: 'Жим лёжа — 75% массы тела', target: 0.75, metric: 'weight', terms: ['жим лёжа', 'жим лежа'], rank: 'S' },
    { title: 'Жим лёжа — масса тела', target: 1, metric: 'weight', terms: ['жим лёжа', 'жим лежа'], rank: 'SS' },
  ] },
  { name: 'Pull', label: 'Тяга', skills: [
    { title: 'Первое подтягивание', target: 1, metric: 'reps', terms: ['подтяг'], rank: 'E' },
    { title: 'Подтягивания — серия 3', target: 3, metric: 'reps', terms: ['подтяг'], rank: 'D' },
    { title: 'Подтягивания — серия 5', target: 5, metric: 'reps', terms: ['подтяг'], rank: 'C' },
    { title: 'Подтягивания — серия 10', target: 10, metric: 'reps', terms: ['подтяг'], rank: 'B' },
    { title: 'Подтягивания — серия 15', target: 15, metric: 'reps', terms: ['подтяг'], rank: 'A' },
    { title: 'Становая тяга — 125% массы тела', target: 1.25, metric: 'weight', terms: ['станов', 'deadlift'], rank: 'S' },
    { title: 'Становая тяга — 150% массы тела', target: 1.5, metric: 'weight', terms: ['станов', 'deadlift'], rank: 'SS' },
  ] },
  { name: 'Legs', label: 'Ноги', skills: [
    { title: 'Приседания с собственным весом', target: 15, metric: 'reps', terms: ['присед'], rank: 'E' },
    { title: 'Приседания — серия 30', target: 30, metric: 'reps', terms: ['присед'], rank: 'D' },
    { title: 'Присед — 50% массы тела', target: 0.5, metric: 'weight', terms: ['присед'], rank: 'C' },
    { title: 'Присед — 75% массы тела', target: 0.75, metric: 'weight', terms: ['присед'], rank: 'B' },
    { title: 'Присед — масса тела', target: 1, metric: 'weight', terms: ['присед'], rank: 'A' },
    { title: 'Присед — 125% массы тела', target: 1.25, metric: 'weight', terms: ['присед'], rank: 'S' },
    { title: 'Присед — 150% массы тела', target: 1.5, metric: 'weight', terms: ['присед'], rank: 'SS' },
  ] },
  { name: 'Core', label: 'Кор', skills: [
    { title: 'Планка 30 секунд', target: 30, metric: 'duration', terms: ['планк'], rank: 'E' },
    { title: 'Планка 60 секунд', target: 60, metric: 'duration', terms: ['планк'], rank: 'D' },
    { title: 'Боковая планка 45 секунд', target: 45, metric: 'duration', terms: ['боковая планка'], rank: 'C' },
    { title: 'Планка 2 минуты', target: 120, metric: 'duration', terms: ['планк'], rank: 'B' },
    { title: 'Подъёмы ног в висе', target: 10, metric: 'reps', terms: ['подъём ног', 'подъем ног'], rank: 'A' },
    { title: 'Планка 3 минуты', target: 180, metric: 'duration', terms: ['планк'], rank: 'S' },
    { title: 'L-sit 30 секунд', target: 30, metric: 'duration', terms: ['l-sit', 'упоре'], rank: 'SS' },
  ] },
  { name: 'Cardio', label: 'Кардио', skills: [
    { title: 'Бег 1 км', target: 1, metric: 'distance', terms: ['бег', 'км'], rank: 'E' },
    { title: 'Бег 3 км', target: 3, metric: 'distance', terms: ['бег', 'км'], rank: 'D' },
    { title: 'Бег 5 км', target: 5, metric: 'distance', terms: ['бег', 'км'], rank: 'C' },
    { title: 'Бег 10 км', target: 10, metric: 'distance', terms: ['бег', 'км'], rank: 'B' },
    { title: 'Велотренировка 30 км', target: 30, metric: 'distance', terms: ['велосипед', 'велотренировка'], rank: 'A' },
    { title: 'Бег 15 км', target: 15, metric: 'distance', terms: ['бег', 'км'], rank: 'S' },
    { title: 'Полумарафон', target: 21, metric: 'distance', terms: ['бег', 'км'], rank: 'SS' },
  ] },
];
const ranks = ['E', 'D', 'C', 'B', 'A', 'S', 'SS'];

const metricUnit = (metric: SkillMetric) => ({ weight: 'кг', reps: 'повт.', duration: 'сек.', distance: 'км' })[metric];
const stateLabel = (state: SkillState) => ({ locked: 'Закрыт', available: 'Доступен', unlocked: 'Выполнен' })[state];

export default function SkillTree() {
  const user = useAuthStore((state) => state.user);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [selectedBranch, setSelectedBranch] = useState(0);
  const [selectedSkill, setSelectedSkill] = useState<SelectedSkill | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  useEffect(() => {
    if (!user) {
      setLogs([]);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const [logResult, profileResult] = await Promise.all([
          supabase.from('workout_logs').select('exercise_name, weight, reps, duration_seconds, distance_km').eq('user_id', user.id),
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        ]);
        if (logResult.error) throw logResult.error;
        if (profileResult.error) throw profileResult.error;
        if (active) {
          setLogs((logResult.data ?? []) as Log[]);
          setAssessment(profileResult.data as Assessment | null);
        }
      } catch (error) {
        console.error('Skill tree load error', error);
      }
    };
    void load();
    return () => { active = false; };
  }, [user]);

  const progressFor = (skill: Skill) => logs
    .filter((log) => skill.terms.some((term) => log.exercise_name.toLowerCase().includes(term)))
    .reduce((max, log) => {
      if (skill.metric === 'weight') return Math.max(max, Number(log.weight) || 0);
      if (skill.metric === 'reps') return Math.max(max, Number(log.reps) || 0);
      if (skill.metric === 'duration') return Math.max(max, Number(log.duration_seconds) || 0);
      return Math.max(max, Number(log.distance_km) || 0);
    }, 0);

  const targetFor = (skill: Skill) => {
    const level = assessment?.training_level;
    const scale = level === 'professional' || level === 'advanced' ? 1.25 : level === 'intermediate' ? 1.1 : 1;
    const bodyWeightTarget = skill.metric === 'weight' && skill.target < 2
      ? skill.target * Number(assessment?.weight || 0)
      : skill.target;
    return Math.max(1, Math.ceil(bodyWeightTarget * scale));
  };

  const personalizedProgressFor = (skill: Skill) => {
    const logged = progressFor(skill);
    if (skill.metric === 'reps' && skill.terms.some((term) => term.includes('отжим'))) {
      return Math.max(logged, Number(assessment?.pushups_max) || 0);
    }
    if (skill.metric === 'reps' && skill.terms.some((term) => term.includes('подтяг'))) {
      return Math.max(logged, Number(assessment?.pullups_max) || 0);
    }
    if (skill.metric === 'weight' && skill.terms.includes('присед')) {
      return Math.max(logged, Number(assessment?.squat_1rm) || 0);
    }
    if (skill.metric === 'weight' && skill.terms.some((term) => term.includes('станов'))) {
      return Math.max(logged, Number(assessment?.deadlift_1rm) || 0);
    }
    return logged;
  };

  const selectBranch = (index: number) => {
    setSelectedBranch(index);
    setExpanded((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
    setSelectedSkill(null);
  };

  const branch = branches[selectedBranch];
  return (
    <section className="card-modern overflow-hidden">
      <div className="mb-5 flex items-center justify-between">
        <div><p className="text-xs uppercase tracking-[0.18em] text-accent-blue">Карта прогресса</p><h2 className="text-xl font-bold text-text">Дерево навыков</h2></div>
        <Zap size={20} className="text-accent-blue" />
      </div>
      <div className="mb-5 flex gap-1 overflow-x-auto pb-1">
        {ranks.map((rank) => <span key={rank} className="min-w-8 rounded-md bg-bg-tertiary px-2 py-1 text-center text-xs font-bold text-text-tertiary">{rank}</span>)}
      </div>
      <div className="mb-4 flex items-center gap-1 text-xs text-text-tertiary"><span>Дерево</span><ChevronRight size={14} /><span className="text-accent-blue">{branch.label}</span></div>
      <div className="grid gap-2 md:grid-cols-5">
        {branches.map((item, index) => (
          <button type="button" key={item.name} onClick={() => selectBranch(index)} className={`flex items-center justify-between rounded-lg border px-3 py-3 text-left text-sm transition ${selectedBranch === index ? 'border-accent-blue bg-accent-blue/15 text-accent-blue' : 'border-border text-text-secondary hover:border-accent-blue/60'}`}>
            <span>{item.label}</span>{expanded.includes(index) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ))}
      </div>
      {expanded.includes(selectedBranch) && (
        <div className="relative mt-4 max-w-xl space-y-2 border-l border-accent-blue/40 pl-5">
          {branch.skills.map((skill, skillIndex) => {
            const progress = personalizedProgressFor(skill);
            const target = targetFor(skill);
            const previous = skillIndex === 0 || personalizedProgressFor(branch.skills[skillIndex - 1]) >= targetFor(branch.skills[skillIndex - 1]);
            const state: SkillState = progress >= target ? 'unlocked' : previous ? 'available' : 'locked';
            const rank = skill.rank;
            return (
              <button type="button" key={skill.title} aria-label={`${skill.title}, ранг ${rank}: ${stateLabel(state)}`} onClick={() => setSelectedSkill({ skill, progress, target, rank, state })} className={`relative flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm transition ${state === 'unlocked' ? 'border-accent-green/50 bg-accent-green/10 text-accent-green' : state === 'available' ? 'border-accent-blue/50 bg-accent-blue/10 text-accent-blue' : 'border-border bg-bg-tertiary/50 text-text-tertiary opacity-60'}`}>
                <span className="absolute -left-[21px] h-2 w-2 rounded-full bg-current" />
                {state === 'unlocked' ? <Check size={15} /> : state === 'available' ? <Zap size={15} /> : <Lock size={14} />}
                <span className="flex-1">{skill.title}</span>
                <span className="text-[10px] uppercase tracking-wider">{rank} · {stateLabel(state)}</span>
              </button>
            );
          })}
        </div>
      )}
      {selectedSkill && (
        <div className="mt-4 rounded-lg border border-accent-blue/30 bg-accent-blue/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-text">{selectedSkill.skill.title}</h3>
              <p className="mt-1 text-sm text-text-secondary">Статус: {stateLabel(selectedSkill.state)} · Ранг: <strong className="text-accent-blue">{selectedSkill.rank}</strong> · Прогресс: {selectedSkill.progress} / {selectedSkill.target} {metricUnit(selectedSkill.skill.metric)}</p>
              <div className="mt-3 h-2 rounded-full bg-bg-tertiary"><div className="h-full rounded-full bg-accent-blue" style={{ width: `${Math.min(100, selectedSkill.progress / selectedSkill.target * 100)}%` }} /></div>
              <p className="mt-2 text-xs text-text-tertiary">До цели: {Math.max(0, selectedSkill.target - selectedSkill.progress)} {metricUnit(selectedSkill.skill.metric)} · уровень цели адаптирован под анкету</p>
            </div>
            <button type="button" aria-label="Закрыть детали навыка" onClick={() => setSelectedSkill(null)} className="text-text-tertiary hover:text-text"><X size={16} /></button>
          </div>
        </div>
      )}
    </section>
  );
}
