ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.sleep_logs
  ADD COLUMN IF NOT EXISTS log_date date,
  ADD COLUMN IF NOT EXISTS quality integer NOT NULL DEFAULT 3;

UPDATE public.sleep_logs
SET log_date = created_at::date
WHERE log_date IS NULL;
ALTER TABLE public.sleep_logs
  ALTER COLUMN log_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN log_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_date
  ON public.sleep_logs(user_id, log_date DESC);

CREATE TABLE IF NOT EXISTS public.workout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  exercise_name text NOT NULL,
  sets integer NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 0,
  weight numeric NOT NULL DEFAULT 0,
  intensity integer NOT NULL DEFAULT 5 CHECK (intensity >= 1 AND intensity <= 10),
  note text,
  duration_seconds integer NOT NULL DEFAULT 0,
  distance_km numeric NOT NULL DEFAULT 0,
  completed_sets integer[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_workout_logs" ON public.workout_logs;
CREATE POLICY "select_own_workout_logs"
  ON public.workout_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_workout_logs" ON public.workout_logs;
CREATE POLICY "insert_own_workout_logs"
  ON public.workout_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_workout_logs" ON public.workout_logs;
CREATE POLICY "update_own_workout_logs"
  ON public.workout_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_workout_logs" ON public.workout_logs;
CREATE POLICY "delete_own_workout_logs"
  ON public.workout_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distance_km numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_sets integer[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date
  ON public.workout_logs(user_id, log_date DESC);

CREATE TABLE IF NOT EXISTS public.weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  weight numeric NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_weight" ON public.weight_logs;
CREATE POLICY "select_own_weight"
  ON public.weight_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_weight" ON public.weight_logs;
CREATE POLICY "insert_own_weight"
  ON public.weight_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_weight" ON public.weight_logs;
CREATE POLICY "update_own_weight"
  ON public.weight_logs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_weight" ON public.weight_logs;
CREATE POLICY "delete_own_weight"
  ON public.weight_logs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date
  ON public.weight_logs(user_id, log_date DESC);

INSERT INTO public.weight_logs (user_id, weight, log_date)
SELECT p.id, p.weight, CURRENT_DATE
FROM public.profiles AS p
WHERE p.weight IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.weight_logs AS w
    WHERE w.user_id = p.id
      AND w.log_date = CURRENT_DATE
      AND w.weight = p.weight
  );

CREATE TABLE IF NOT EXISTS public.food_products (
  id serial PRIMARY KEY,
  name text NOT NULL,
  proteins numeric NOT NULL DEFAULT 0,
  fats numeric NOT NULL DEFAULT 0,
  carbs numeric NOT NULL DEFAULT 0,
  calories numeric NOT NULL DEFAULT 0,
  serving_size integer NOT NULL DEFAULT 100,
  category text NOT NULL DEFAULT 'other',
  barcode text,
  brand text,
  is_global boolean NOT NULL DEFAULT true,
  source text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.food_products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.food_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_products" ON public.food_products;
CREATE POLICY "read_products"
  ON public.food_products FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());
DROP POLICY IF EXISTS "insert_products" ON public.food_products;
DROP POLICY IF EXISTS "insert_user_products" ON public.food_products;
CREATE POLICY "insert_user_products"
  ON public.food_products FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.nutrition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id integer REFERENCES public.food_products(id),
  custom_name text,
  meal_type text NOT NULL,
  grams integer NOT NULL DEFAULT 100,
  proteins numeric NOT NULL DEFAULT 0,
  fats numeric NOT NULL DEFAULT 0,
  carbs numeric NOT NULL DEFAULT 0,
  calories numeric NOT NULL DEFAULT 0,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nutrition_logs
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS product_id integer REFERENCES public.food_products(id),
  ADD COLUMN IF NOT EXISTS custom_name text,
  ADD COLUMN IF NOT EXISTS meal_type text,
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
CREATE POLICY "select_own_nutrition"
  ON public.nutrition_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_nutrition" ON public.nutrition_logs;
CREATE POLICY "insert_own_nutrition"
  ON public.nutrition_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_nutrition" ON public.nutrition_logs;
CREATE POLICY "update_own_nutrition"
  ON public.nutrition_logs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_nutrition" ON public.nutrition_logs;
CREATE POLICY "delete_own_nutrition"
  ON public.nutrition_logs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_nutrition_user_date
  ON public.nutrition_logs(user_id, log_date DESC);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_chat" ON public.chat_messages;
CREATE POLICY "select_own_chat"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_chat" ON public.chat_messages;
CREATE POLICY "insert_own_chat"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_chat" ON public.chat_messages;
CREATE POLICY "delete_own_chat"
  ON public.chat_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON public.chat_messages(user_id, created_at ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weight_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_logs TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_products TO authenticated;
DO $$
BEGIN
  IF to_regclass('public.food_products_id_seq') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.food_products_id_seq TO authenticated';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
