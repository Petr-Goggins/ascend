import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { useCoachStore } from '@/store/coachStore';
import { useCycleStore } from '@/store/cycleStore';
import { useNutritionStore } from '@/store/nutritionStore';
import { usePlanStore } from '@/store/planStore';
import { useProfileStore } from '@/store/profileStore';
import { useProgressStore } from '@/store/progressStore';
import { useSleepLogStore } from '@/store/sleepLogStore';
import { useStatsStore } from '@/store/statsStore';
import { useTrackingStore } from '@/store/trackingStore';
import { useWaterStore } from '@/store/waterStore';
import { useWorkoutLogStore } from '@/store/workoutLogStore';
import { useWorkoutStore } from '@/store/workoutStore';

export async function signOutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;

  useAuthStore.getState().reset();
  useProfileStore.getState().reset();
  useWaterStore.getState().reset();
  useChatStore.getState().reset();
  useTrackingStore.getState().reset();
  useStatsStore.getState().reset();
  usePlanStore.getState().reset();
  useProgressStore.getState().reset();
  useCoachStore.getState().reset();
  useNutritionStore.getState().reset();
  useSleepLogStore.getState().reset();
  useWorkoutLogStore.getState().reset();
  useCycleStore.getState().setPhase(null);
  useWorkoutStore.getState().stopWorkout();
}
