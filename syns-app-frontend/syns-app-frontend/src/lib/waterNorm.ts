const MILLILITERS_PER_KG = 35;
const MINIMUM_MILLILITERS = 1500;
const MAXIMUM_MILLILITERS = 4500;
const ROUNDING_STEP = 100;

export function calculateWaterNorm(weightKg: number | null | undefined): number | null {
  if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }

  const estimate = Math.min(
    MAXIMUM_MILLILITERS,
    Math.max(MINIMUM_MILLILITERS, weightKg * MILLILITERS_PER_KG),
  );
  return Math.round(estimate / ROUNDING_STEP) * ROUNDING_STEP;
}
