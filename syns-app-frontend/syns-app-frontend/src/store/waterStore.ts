import { create } from 'zustand';
import type { WaterLog } from '@/types';
import { supabase } from '@/lib/supabase';

interface WaterState {
  logs: WaterLog[];
  todayAmount: number;
  goal: number;
  loading: boolean;
  fetchToday: (userId: string) => Promise<void>;
  addWater: (userId: string, amount: number) => Promise<void>;
  setGoal: (goal: number) => void;
  reset: () => void;
}

const WATER_GOAL = 2500;

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export const useWaterStore = create<WaterState>((set, get) => ({
  logs: [],
  todayAmount: 0,
  goal: WATER_GOAL,
  loading: false,
  fetchToday: async (userId: string) => {
    set({ loading: true });
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('water_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', start.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      const today = (data ?? []).filter((log) => isToday(log.created_at));
      const total = today.reduce((sum, log) => sum + Number(log.amount || 0), 0);
      set({ logs: today, todayAmount: total, loading: false });
    } catch (error) {
      set({ loading: false });
      console.error('Water log load failed', error);
      throw error;
    }
  },
  addWater: async (userId: string, amount: number) => {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Объём воды должен быть положительным целым числом');
    }
    const { error } = await supabase
      .from('water_logs')
      .insert({ user_id: userId, amount });
    if (error) {
      console.error('Water log insert failed', error);
      throw error;
    }
    const newLog: WaterLog = {
      id: crypto.randomUUID(),
      user_id: userId,
      amount,
      created_at: new Date().toISOString(),
    };
    set({
      logs: [newLog, ...get().logs],
      todayAmount: get().todayAmount + amount,
    });
  },
  setGoal: (goal) => set({ goal }),
  reset: () => set({ logs: [], todayAmount: 0, loading: false }),
}));
