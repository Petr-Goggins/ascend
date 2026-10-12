import { create } from 'zustand';

interface WorkoutState {
  isActive: boolean;
  isPaused: boolean;
  elapsedTime: number;
  startedAt: number | null;
  startWorkout: () => void;
  stopWorkout: () => void;
  togglePause: () => void;
  hydrate: () => void;
}

let timer: number | null = null;

const tick = (set: (state: Partial<WorkoutState>) => void, startedAt: number, pausedAt: number | null, pausedSeconds: number) => {
  if (!pausedAt) set({ elapsedTime: Math.max(0, Math.floor((Date.now() - startedAt) / 1000) - pausedSeconds) });
};

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  isActive: false,
  isPaused: false,
  elapsedTime: 0,
  startedAt: null,
  startWorkout: () => {
    const startedAt = Date.now();
    window.localStorage.setItem('ascend-workout-start', String(startedAt));
    window.localStorage.removeItem('ascend-workout-paused-at');
    window.localStorage.removeItem('ascend-workout-paused-seconds');
    set({ isActive: true, isPaused: false, elapsedTime: 0, startedAt });
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(() => tick(set, startedAt, null, 0), 1000);
  },
  stopWorkout: () => {
    if (timer) window.clearInterval(timer);
    timer = null;
    window.localStorage.removeItem('ascend-workout-start');
    window.localStorage.removeItem('ascend-workout-paused-at');
    window.localStorage.removeItem('ascend-workout-paused-seconds');
    set({ isActive: false, isPaused: false, elapsedTime: 0, startedAt: null });
  },
  togglePause: () => {
    const state = get();
    if (!state.isActive || !state.startedAt) return;
    if (state.isPaused) {
      const pausedSeconds = Number(window.localStorage.getItem('ascend-workout-paused-seconds') || 0) + Math.floor((Date.now() - Number(window.localStorage.getItem('ascend-workout-paused-at') || Date.now())) / 1000);
      window.localStorage.setItem('ascend-workout-paused-seconds', String(pausedSeconds));
      window.localStorage.removeItem('ascend-workout-paused-at');
      set({ isPaused: false });
      if (timer) window.clearInterval(timer);
      timer = window.setInterval(() => tick(set, state.startedAt!, null, pausedSeconds), 1000);
    } else {
      window.localStorage.setItem('ascend-workout-paused-at', String(Date.now()));
      set({ isPaused: true });
      if (timer) window.clearInterval(timer);
      timer = null;
    }
  },
  hydrate: () => {
    const startedAt = Number(window.localStorage.getItem('ascend-workout-start') || 0);
    if (!startedAt) return;
    const pausedAt = Number(window.localStorage.getItem('ascend-workout-paused-at') || 0) || null;
    const pausedSeconds = Number(window.localStorage.getItem('ascend-workout-paused-seconds') || 0);
    const elapsedEnd = pausedAt || Date.now();
    set({ isActive: true, isPaused: Boolean(pausedAt), startedAt, elapsedTime: Math.max(0, Math.floor((elapsedEnd - startedAt) / 1000) - pausedSeconds) });
    if (!pausedAt) {
      if (timer) window.clearInterval(timer);
      timer = window.setInterval(() => tick(set, startedAt, null, pausedSeconds), 1000);
    }
  },
}));
