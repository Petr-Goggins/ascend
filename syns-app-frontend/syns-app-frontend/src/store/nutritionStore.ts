import { create } from 'zustand';
import type { FoodProduct, NutritionLog, NutritionMealType } from '@/types';
import { supabase } from '@/lib/supabase';
import { useStatsStore } from '@/store/statsStore';

interface NutritionState {
  logs: NutritionLog[];
  searchResults: FoodProduct[];
  searching: boolean;
  loading: boolean;
  error: string | null;
  todayCalories: number;
  fetchDaily: (userId: string, date: string) => Promise<void>;
  fetchToday: (userId: string) => Promise<void>;
  getTodayCalories: () => number;
  searchProducts: (query: string) => Promise<void>;
  addEntry: (
    userId: string,
    data: {
      product_id: number | null;
      custom_name: string | null;
      meal_type: NutritionMealType;
      grams: number;
      proteins: number;
      fats: number;
      carbs: number;
      calories: number;
      log_date: string;
    }
  ) => Promise<boolean>;
  deleteEntry: (logId: string) => Promise<void>;
  addProduct: (data: Omit<FoodProduct, 'id'>) => Promise<FoodProduct | null>;
  saveApiProduct: (product: Partial<FoodProduct>) => Promise<FoodProduct | null>;
  reset: () => void;
}

export const useNutritionStore = create<NutritionState>((set, get) => ({
  logs: [],
  searchResults: [],
  searching: false,
  loading: false,
  error: null,
  todayCalories: 0,

  fetchDaily: async (userId: string, date: string) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('log_date', date)
      .order('created_at', { ascending: true });
    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    const logs = data as NutritionLog[] ?? [];
    set({ logs, todayCalories: logs.reduce((sum, log) => sum + Number(log.calories || 0), 0), loading: false });
  },

  fetchToday: async (userId) => {
    try {
      await get().fetchDaily(userId, new Date().toISOString().slice(0, 10));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Не удалось загрузить калории' });
    }
  },

  getTodayCalories: () => get().todayCalories,

  searchProducts: async (query: string) => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      set({ searchResults: [], error: null, searching: false });
      return;
    }

    set({ searching: true, error: null });
    try {
      const { data, error } = await supabase
        .from('food_products')
        .select('*')
        .or(`name.ilike.%${normalizedQuery}%,brand.ilike.%${normalizedQuery}%`)
        .limit(10);
      if (error) throw error;
      set({ searchResults: (data as FoodProduct[]) ?? [] });
    } catch (error) {
      console.error('Product search failed', error);
      set({
        searchResults: [],
        error: '?? ??????? ????? ????????. ?????????? ????? ??? ??????? ??????? ???????.',
      });
    } finally {
      set({ searching: false });
    }
  },

  addEntry: async (userId, entryData) => {
    const { data, error } = await supabase
      .from('nutrition_logs')
      .insert({ user_id: userId, ...entryData })
      .select()
      .single();
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ logs: [...get().logs, data as NutritionLog], todayCalories: get().todayCalories + Number(entryData.calories || 0) });

    // Award XP for logging nutrition
    const statsStore = useStatsStore.getState();
    if (statsStore.stats) {
      const newXP = statsStore.stats.xp + 5;
      const newLevel =
        newXP >= statsStore.stats.level * 100
          ? statsStore.stats.level + 1
          : statsStore.stats.level;
      const updatedStats = {
        ...statsStore.stats,
        xp: newXP,
        level: newLevel,
        nutrition: Math.min(100, statsStore.stats.nutrition + 1),
      };
      await supabase.from('user_stats').update(updatedStats).eq('id', statsStore.stats.id);
      useStatsStore.setState({ stats: updatedStats });
    }

    return true;
  },

  deleteEntry: async (logId: string) => {
    await supabase.from('nutrition_logs').delete().eq('id', logId);
    set({ logs: get().logs.filter((l) => l.id !== logId) });
  },

  addProduct: async (data) => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      set({ error: authError?.message ?? 'Требуется войти в аккаунт' });
      return null;
    }
    const { data: product, error } = await supabase
      .from('food_products')
      .insert({ ...data, user_id: authData.user.id, is_global: false, source: 'manual' })
      .select()
      .single();
    if (error) {
      set({ error: error.message });
      return null;
    }
    // Award +5 XP for creating custom product
    const statsStore = useStatsStore.getState();
    if (statsStore.stats) {
      const newXP = statsStore.stats.xp + 5;
      await supabase.from('user_stats').update({ xp: newXP }).eq('id', statsStore.stats.id);
      useStatsStore.setState({ stats: { ...statsStore.stats, xp: newXP } });
    }
    return product as FoodProduct;
  },

  saveApiProduct: async (product) => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      set({ error: authError?.message ?? 'Требуется войти в аккаунт' });
      return null;
    }
    const { data: existing } = await supabase
      .from('food_products')
      .select('id')
      .eq('name', product.name ?? '')
      .maybeSingle();
    if (existing) return existing as FoodProduct;

    const { data: saved, error } = await supabase
      .from('food_products')
      .insert({ ...product, user_id: authData.user.id, is_global: false, source: 'api' })
      .select()
      .single();
    if (error) return null;
    return saved as FoodProduct;
  },

  reset: () => set({ logs: [], searchResults: [], todayCalories: 0, loading: false, error: null }),
}));
