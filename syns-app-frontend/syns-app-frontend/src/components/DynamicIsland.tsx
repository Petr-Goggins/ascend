import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Droplet, Dumbbell, Moon, Pause, Play, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useProfileStore } from '@/store/profileStore';
import { useWorkoutStore } from '@/store/workoutStore';
import { useSleepLogStore } from '@/store/sleepLogStore';
import { useCycleStore } from '@/store/cycleStore';
import { useNutritionStore } from '@/store/nutritionStore';

type IslandState = 'workout' | 'paused' | 'no-profile' | 'no-sleep' | 'cycle' | 'idle';

const glassStyle: React.CSSProperties = {
  position: 'fixed',
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 100,
  height: 40,
  padding: '0 16px',
  borderRadius: 32,
  background: 'rgba(255, 255, 255, 0.05)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
};

function getCycleText(phase: string) {
  return ['Овуляторная', 'Фолликулярная'].includes(phase)
    ? `${phase}. Пик силы! Добавь кардио`
    : `${phase}. Снизь интенсивность`;
}

export default function DynamicIsland() {
  const user = useAuthStore((state) => state.user);
  const profile = useProfileStore((state) => state.profile);
  const profileLoading = useProfileStore((state) => state.loading);
  const fetchProfile = useProfileStore((state) => state.fetchProfile);
  const isActive = useWorkoutStore((state) => state.isActive);
  const isPaused = useWorkoutStore((state) => state.isPaused);
  const elapsedTime = useWorkoutStore((state) => state.elapsedTime);
  const togglePause = useWorkoutStore((state) => state.togglePause);
  const hasSleepToday = useSleepLogStore((state) => state.hasSleepToday);
  const fetchTodaySleep = useSleepLogStore((state) => state.fetchToday);
  const phase = useCycleStore((state) => state.getCurrentPhase());
  const setPhase = useCycleStore((state) => state.setPhase);
  const calories = useNutritionStore((state) => state.getTodayCalories());
  const fetchTodayCalories = useNutritionStore((state) => state.fetchToday);
  const navigate = useNavigate();
  const hydrateWorkout = useWorkoutStore((state) => state.hydrate);
  const [state, setState] = useState<IslandState>('idle');
  const fullText = useRef('');
  const [displayText, setDisplayText] = useState('');
  const typingTimer = useRef<number | null>(null);

  useEffect(() => {
    hydrateWorkout();
  }, [hydrateWorkout]);

  useEffect(() => {
    if (user && !profile && !profileLoading) void fetchProfile(user.id);
  }, [fetchProfile, profile, profileLoading, user]);

  useEffect(() => {
    if (!user || !profile) return;
    void fetchTodaySleep(user.id);
    void fetchTodayCalories(user.id);
    if (profile.gender === 'female' && profile.cycle_last_period) {
      const length = profile.cycle_length || 28;
      const day = Math.max(0, Math.floor((Date.now() - new Date(profile.cycle_last_period).getTime()) / 86400000) % length);
      setPhase(day < 5 ? 'Менструация' : day < 14 ? 'Фолликулярная' : day < 17 ? 'Овуляторная' : 'Лютеиновая');
    } else {
      setPhase(null);
    }
  }, [fetchTodayCalories, fetchTodaySleep, profile, setPhase, user]);

  const nextState = useMemo<IslandState>(() => {
    if (isActive) return isPaused ? 'paused' : 'workout';
    if (!profile?.goal || !profile.weight || !profile.height) return 'no-profile';
    if (!hasSleepToday) return 'no-sleep';
    if (profile.gender === 'female' && phase) return 'cycle';
    return 'idle';
  }, [hasSleepToday, isActive, isPaused, phase, profile]);

  useEffect(() => {
    if (nextState !== state) setState(nextState);
  }, [nextState, state]);

  const stateContent = useMemo(() => {
    switch (state) {
      case 'workout': return 'Тренировка:';
      case 'paused': return 'Пауза';
      case 'no-profile': return 'Заполните анкету →';
      case 'no-sleep': return 'Запишите сон';
      case 'cycle': return phase ? `Сегодня ${getCycleText(phase)}` : 'Сегодня';
      case 'idle': return calories > 0 ? `${calories} ккал` : 'Готов к тренировке';
    }
  }, [calories, phase, state]);

  useEffect(() => {
    fullText.current = stateContent;
    setDisplayText('');
    if (typingTimer.current) window.clearInterval(typingTimer.current);
    let index = 0;
    const speed = stateContent.length > 30 ? 80 : 120;
    typingTimer.current = window.setInterval(() => {
      index += 1;
      setDisplayText(fullText.current.slice(0, index));
      if (index >= fullText.current.length && typingTimer.current) {
        window.clearInterval(typingTimer.current);
        typingTimer.current = null;
      }
    }, speed);
    return () => { if (typingTimer.current) window.clearInterval(typingTimer.current); };
  }, [stateContent]);

  if (!user || profileLoading) return null;
  const isWorkout = state === 'workout' || state === 'paused';
  const Icon = state === 'workout' || state === 'paused' ? Dumbbell : state === 'no-profile' ? User : state === 'no-sleep' ? Moon : state === 'cycle' ? Droplet : Activity;
  const isLong = stateContent.length > 30;
  const goTo = state === 'workout' || state === 'paused' ? '/workout' : state === 'no-profile' ? '/coach' : state === 'no-sleep' ? '/sleep' : state === 'cycle' ? '/cycle' : '/dashboard';

  const handleIslandClick = () => {
    if (displayText !== fullText.current) {
      if (typingTimer.current) window.clearInterval(typingTimer.current);
      typingTimer.current = null;
      setDisplayText(fullText.current);
      return;
    }
    navigate(goTo);
  };

  const handlePauseClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    togglePause();
  };

  return <div
    style={glassStyle}
    className={`dynamic-island ${isLong ? 'island-wide' : ''} flex items-center justify-center gap-2 text-[12px] text-[rgba(255,255,255,0.9)] transition-[width] duration-300 md:text-[14px]`}
  >
    <button type="button" aria-label={fullText.current} onClick={handleIslandClick} className="flex min-w-0 items-center justify-center gap-2 text-inherit hover:text-white">
      <Icon size={16} className="shrink-0 text-[rgba(255,255,255,0.7)]" />
      <span className="min-w-0 truncate">{state === 'workout' ? `${displayText} ${formatTime(elapsedTime)}` : displayText}</span>
    </button>
    {isWorkout && <button type="button" onClick={handlePauseClick} aria-label={state === 'paused' ? 'Продолжить тренировку' : 'Поставить тренировку на паузу'} className="shrink-0 text-[rgba(255,255,255,0.8)] hover:text-[#4F46E5]">{state === 'paused' ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}</button>}
  </div>;
}

export function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
