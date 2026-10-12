-- Ensure the workout-plan table exists and supports the fields used by the app.
-- Safe to re-run; existing plans are preserved.

CREATE TABLE IF NOT EXISTS public.user_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text NOT NULL,
  weeks integer NOT NULL DEFAULT 4,
  days_per_week integer NOT NULL DEFAULT 3,
  workout_type text NOT NULL DEFAULT 'strength',
  structure jsonb NOT NULL DEFAULT '{}'::jsonb,
  weak_muscles text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_plans
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Тренировочный план',
  ADD COLUMN IF NOT EXISTS goal text NOT NULL DEFAULT 'Поддержание формы',
  ADD COLUMN IF NOT EXISTS weeks integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS days_per_week integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS workout_type text NOT NULL DEFAULT 'strength',
  ADD COLUMN IF NOT EXISTS structure jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS weak_muscles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_plans" ON public.user_plans;
CREATE POLICY "select_own_plans" ON public.user_plans
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_plans" ON public.user_plans;
CREATE POLICY "insert_own_plans" ON public.user_plans
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_plans" ON public.user_plans;
CREATE POLICY "update_own_plans" ON public.user_plans
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_plans" ON public.user_plans;
CREATE POLICY "delete_own_plans" ON public.user_plans
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_plans_user_created
  ON public.user_plans(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_plans TO authenticated;
NOTIFY pgrst, 'reload schema';
