ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'not_specified',
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS weight numeric,
  ADD COLUMN IF NOT EXISTS goal text NOT NULL DEFAULT 'maintain',
  ADD COLUMN IF NOT EXISTS activity_level text NOT NULL DEFAULT 'moderate',
  ADD COLUMN IF NOT EXISTS equipment text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cycle_phase text NOT NULL DEFAULT 'not_specified',
  ADD COLUMN IF NOT EXISTS fasting text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS diet text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS target_weight numeric,
  ADD COLUMN IF NOT EXISTS start_weight numeric,
  ADD COLUMN IF NOT EXISTS training_level text NOT NULL DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS weak_muscles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS days_per_week integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS cycle_last_period date,
  ADD COLUMN IF NOT EXISTS cycle_length integer NOT NULL DEFAULT 28,
  ADD COLUMN IF NOT EXISTS inventory text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS focus_muscles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS injuries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS personal_goal text,
  ADD COLUMN IF NOT EXISTS preferences text,
  ADD COLUMN IF NOT EXISTS questionnaire_completed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  weight numeric NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weight_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS weight numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS log_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_weight" ON public.weight_logs;
CREATE POLICY "select_own_weight" ON public.weight_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_weight" ON public.weight_logs;
CREATE POLICY "insert_own_weight" ON public.weight_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_weight" ON public.weight_logs;
CREATE POLICY "update_own_weight" ON public.weight_logs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_weight" ON public.weight_logs;
CREATE POLICY "delete_own_weight" ON public.weight_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date
  ON public.weight_logs(user_id, log_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weight_logs TO authenticated;

NOTIFY pgrst, 'reload schema';
