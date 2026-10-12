-- Reconcile the live project with columns and tables used by the current app.
-- Safe to re-run; existing user data is retained.

CREATE TABLE IF NOT EXISTS public.water_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.water_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_water" ON public.water_logs;
CREATE POLICY "select_own_water" ON public.water_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_water" ON public.water_logs;
CREATE POLICY "insert_own_water" ON public.water_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_water" ON public.water_logs;
CREATE POLICY "update_own_water" ON public.water_logs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_water" ON public.water_logs;
CREATE POLICY "delete_own_water" ON public.water_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_water_logs_user_created
  ON public.water_logs(user_id, created_at DESC);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS target_weight numeric,
  ADD COLUMN IF NOT EXISTS start_weight numeric,
  ADD COLUMN IF NOT EXISTS personal_goal text,
  ADD COLUMN IF NOT EXISTS inventory text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS focus_muscles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS injuries text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.sleep_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS log_date date,
  ADD COLUMN IF NOT EXISTS quality integer NOT NULL DEFAULT 3;
UPDATE public.sleep_logs
SET log_date = created_at::date
WHERE log_date IS NULL;
ALTER TABLE public.sleep_logs
  ALTER COLUMN log_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN log_date SET NOT NULL;
ALTER TABLE public.sleep_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_sleep" ON public.sleep_logs;
CREATE POLICY "select_own_sleep" ON public.sleep_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_sleep" ON public.sleep_logs;
CREATE POLICY "insert_own_sleep" ON public.sleep_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_sleep" ON public.sleep_logs;
CREATE POLICY "update_own_sleep" ON public.sleep_logs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_sleep" ON public.sleep_logs;
CREATE POLICY "delete_own_sleep" ON public.sleep_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_date
  ON public.sleep_logs(user_id, log_date DESC);

CREATE TABLE IF NOT EXISTS public.workout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  exercise_name text NOT NULL DEFAULT '',
  sets integer NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 0,
  weight numeric NOT NULL DEFAULT 0,
  intensity integer NOT NULL DEFAULT 5,
  note text,
  duration_seconds integer NOT NULL DEFAULT 0,
  distance_km numeric NOT NULL DEFAULT 0,
  completed_sets integer[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS log_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS exercise_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sets integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weight numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intensity integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distance_km numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_sets integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_workout_logs" ON public.workout_logs;
CREATE POLICY "select_own_workout_logs" ON public.workout_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_workout_logs" ON public.workout_logs;
CREATE POLICY "insert_own_workout_logs" ON public.workout_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_workout_logs" ON public.workout_logs;
CREATE POLICY "update_own_workout_logs" ON public.workout_logs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_workout_logs" ON public.workout_logs;
CREATE POLICY "delete_own_workout_logs" ON public.workout_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date
  ON public.workout_logs(user_id, log_date DESC);

CREATE TABLE IF NOT EXISTS public.workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'strength',
  duration integer NOT NULL DEFAULT 0,
  intensity text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'strength',
  ADD COLUMN IF NOT EXISTS duration integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intensity text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_workouts" ON public.workouts;
CREATE POLICY "select_own_workouts" ON public.workouts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_workouts" ON public.workouts;
CREATE POLICY "insert_own_workouts" ON public.workouts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_workouts" ON public.workouts;
CREATE POLICY "update_own_workouts" ON public.workouts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_workouts" ON public.workouts;
CREATE POLICY "delete_own_workouts" ON public.workouts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.nutrition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id integer,
  custom_name text,
  meal_type text NOT NULL DEFAULT 'snack',
  grams integer NOT NULL DEFAULT 100,
  proteins numeric NOT NULL DEFAULT 0,
  fats numeric NOT NULL DEFAULT 0,
  carbs numeric NOT NULL DEFAULT 0,
  calories numeric NOT NULL DEFAULT 0,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutrition_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS product_id integer,
  ADD COLUMN IF NOT EXISTS custom_name text,
  ADD COLUMN IF NOT EXISTS meal_type text NOT NULL DEFAULT 'snack',
  ADD COLUMN IF NOT EXISTS grams integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS proteins numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fats numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carbs numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calories numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS log_date date,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
UPDATE public.nutrition_logs
SET log_date = created_at::date
WHERE log_date IS NULL;
ALTER TABLE public.nutrition_logs
  ALTER COLUMN log_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN log_date SET NOT NULL;
ALTER TABLE public.nutrition_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_nutrition" ON public.nutrition_logs;
CREATE POLICY "select_own_nutrition" ON public.nutrition_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_nutrition" ON public.nutrition_logs;
CREATE POLICY "insert_own_nutrition" ON public.nutrition_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_nutrition" ON public.nutrition_logs;
CREATE POLICY "update_own_nutrition" ON public.nutrition_logs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_nutrition" ON public.nutrition_logs;
CREATE POLICY "delete_own_nutrition" ON public.nutrition_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_user_date
  ON public.nutrition_logs(user_id, log_date DESC);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'assistant',
  ADD COLUMN IF NOT EXISTS content text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_chat" ON public.chat_messages;
CREATE POLICY "select_own_chat" ON public.chat_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_chat" ON public.chat_messages;
CREATE POLICY "insert_own_chat" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_chat" ON public.chat_messages;
CREATE POLICY "delete_own_chat" ON public.chat_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON public.chat_messages(user_id, created_at ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.water_logs, public.sleep_logs, public.workout_logs, public.workouts,
  public.nutrition_logs, public.chat_messages TO authenticated;

NOTIFY pgrst, 'reload schema';
