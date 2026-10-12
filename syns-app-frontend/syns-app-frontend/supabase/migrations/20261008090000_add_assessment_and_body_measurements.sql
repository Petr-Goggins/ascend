ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activity_work text,
  ADD COLUMN IF NOT EXISTS nutrition_notes text,
  ADD COLUMN IF NOT EXISTS meals_per_day integer,
  ADD COLUMN IF NOT EXISTS target_change_kg_week numeric,
  ADD COLUMN IF NOT EXISTS health_restrictions text,
  ADD COLUMN IF NOT EXISTS body_fat_percent numeric,
  ADD COLUMN IF NOT EXISTS waist_cm numeric,
  ADD COLUMN IF NOT EXISTS chest_cm numeric,
  ADD COLUMN IF NOT EXISTS hip_cm numeric,
  ADD COLUMN IF NOT EXISTS training_experience_months integer,
  ADD COLUMN IF NOT EXISTS training_history text,
  ADD COLUMN IF NOT EXISTS bench_press_1rm numeric,
  ADD COLUMN IF NOT EXISTS squat_1rm numeric,
  ADD COLUMN IF NOT EXISTS deadlift_1rm numeric,
  ADD COLUMN IF NOT EXISTS pushups_max integer,
  ADD COLUMN IF NOT EXISTS pullups_max integer,
  ADD COLUMN IF NOT EXISTS workout_duration_minutes integer;

CREATE TABLE IF NOT EXISTS public.body_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  weight numeric,
  body_fat_percent numeric,
  waist_cm numeric,
  chest_cm numeric,
  hip_cm numeric,
  arm_cm numeric,
  thigh_cm numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT body_measurements_has_value CHECK (
    weight IS NOT NULL OR body_fat_percent IS NOT NULL OR waist_cm IS NOT NULL
    OR chest_cm IS NOT NULL OR hip_cm IS NOT NULL OR arm_cm IS NOT NULL OR thigh_cm IS NOT NULL
  )
);

ALTER TABLE public.body_measurements
  ADD COLUMN IF NOT EXISTS log_date date,
  ADD COLUMN IF NOT EXISTS weight numeric,
  ADD COLUMN IF NOT EXISTS body_fat_percent numeric,
  ADD COLUMN IF NOT EXISTS waist_cm numeric,
  ADD COLUMN IF NOT EXISTS chest_cm numeric,
  ADD COLUMN IF NOT EXISTS hip_cm numeric,
  ADD COLUMN IF NOT EXISTS arm_cm numeric,
  ADD COLUMN IF NOT EXISTS thigh_cm numeric,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.body_measurements
SET log_date = created_at::date
WHERE log_date IS NULL;

ALTER TABLE public.body_measurements
  ALTER COLUMN log_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN log_date SET NOT NULL;

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_body_measurements" ON public.body_measurements;
CREATE POLICY "select_own_body_measurements" ON public.body_measurements
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_body_measurements" ON public.body_measurements;
CREATE POLICY "insert_own_body_measurements" ON public.body_measurements
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_body_measurements" ON public.body_measurements;
CREATE POLICY "update_own_body_measurements" ON public.body_measurements
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_body_measurements" ON public.body_measurements;
CREATE POLICY "delete_own_body_measurements" ON public.body_measurements
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date
  ON public.body_measurements(user_id, log_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.body_measurements TO authenticated;

NOTIFY pgrst, 'reload schema';
