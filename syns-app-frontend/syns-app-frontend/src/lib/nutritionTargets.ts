import type { ActivityLevel, Gender, Goal } from '@/types';

const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export type NutritionTargets = {
  bmr: number;
  maintenanceCalories: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

export function calculateNutritionTargets(input: {
  gender: Gender;
  age: number | null;
  weight: number | null;
  height: number | null;
  activityLevel: ActivityLevel;
  goal: Goal;
  targetChangeKgWeek?: number | null;
}): NutritionTargets | null {
  const { age, weight, height } = input;
  if (
    input.gender === 'not_specified'
    || age === null || age < 18 || age > 100
    || weight === null || weight <= 0
    || height === null || height <= 0
  ) return null;

  const bmr = 10 * weight + 6.25 * height - 5 * age + (input.gender === 'male' ? 5 : -161);
  const maintenanceCalories = bmr * activityMultipliers[input.activityLevel];
  const defaultAdjustment = input.goal === 'lose' ? 0.15 : input.goal === 'gain' ? 0.1 : 0;
  const requestedAdjustment = input.targetChangeKgWeek
    ? (input.targetChangeKgWeek * 7700 / 7) / maintenanceCalories
    : defaultAdjustment;
  const adjustment = input.goal === 'maintain'
    ? 0
    : Math.min(0.2, Math.max(0.1, requestedAdjustment));
  const calories = Math.round(maintenanceCalories * (input.goal === 'lose' ? 1 - adjustment : 1 + adjustment));
  const protein = Math.round(weight * 1.8);
  const fat = Math.round(weight * 0.9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return {
    bmr: Math.round(bmr),
    maintenanceCalories: Math.round(maintenanceCalories),
    calories,
    protein,
    fat,
    carbs,
  };
}
