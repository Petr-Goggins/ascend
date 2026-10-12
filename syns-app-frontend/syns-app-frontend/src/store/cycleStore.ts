import { create } from 'zustand';

interface CycleState {
  phase: string | null;
  setPhase: (phase: string | null) => void;
  getCurrentPhase: () => string | null;
}

export const useCycleStore = create<CycleState>((set, get) => ({
  phase: null,
  setPhase: (phase) => set({ phase }),
  getCurrentPhase: () => get().phase,
}));
