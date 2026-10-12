import { create } from 'zustand';
import type { Profile } from '@/types';
import { supabase } from '@/lib/supabase';
import { isMissingSchemaError } from '@/lib/supabaseErrors';

interface ProfileState {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  fetchProfile: (userId: string) => Promise<void>;
  updateProfile: (userId: string, data: Partial<Profile>) => Promise<string | null>;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

const emptyProfile = (id: string): Profile => ({
  id,
  email: null,
  gender: 'not_specified',
  age: null,
  height: null,
  weight: null,
  goal: 'maintain',
  activity_level: 'moderate',
  equipment: [],
  cycle_phase: 'not_specified',
  fasting: [],
  diet: [],
  target_weight: null,
  start_weight: null,
  training_level: 'beginner',
  weak_muscles: [],
  days_per_week: 3,
  cycle_last_period: null,
  cycle_length: 28,
  religion: 'none',
  inventory: [],
  focus_muscles: [],
  injuries: [],
  personal_goal: null,
  preferences: null,
  activity_work: null,
  nutrition_notes: null,
  meals_per_day: null,
  target_change_kg_week: null,
  health_restrictions: null,
  body_fat_percent: null,
  waist_cm: null,
  chest_cm: null,
  hip_cm: null,
  training_experience_months: null,
  training_history: null,
  bench_press_1rm: null,
  squat_1rm: null,
  deadlift_1rm: null,
  pushups_max: null,
  pullups_max: null,
  workout_duration_minutes: null,
  questionnaire_completed_at: null,
  updated_at: null,
});

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  loading: false,
  error: null,
  fetchProfile: async (userId: string) => {
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({ profile: data ?? emptyProfile(userId), loading: false });
  },
  updateProfile: async (userId: string, data: Partial<Profile>) => {
    set({ loading: true, error: null });
    const payload = { ...data, id: userId, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('profiles').upsert(payload);
    if (error) {
      const message = isMissingSchemaError(error)
        ? 'Схема Supabase не обновлена. Примените миграцию 20261008090000_add_assessment_and_body_measurements.sql и повторите сохранение.'
        : error.message;
      set({ loading: false, error: message });
      console.error('Profile save failed', { code: error.code, message: error.message, hint: error.hint });
      return message;
    }
    const current = get().profile;
    set({ profile: current ? { ...current, ...data } : emptyProfile(userId), loading: false });
    return null;
  },
  setLoading: (loading) => set({ loading }),
  reset: () => set({ profile: null, loading: false, error: null }),
}));
