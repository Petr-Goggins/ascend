DROP POLICY IF EXISTS "insert_products" ON public.food_products;

ALTER TABLE public.food_products
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "read_products" ON public.food_products;
CREATE POLICY "read_products"
  ON public.food_products
  FOR SELECT
  TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "insert_user_products" ON public.food_products;
CREATE POLICY "insert_user_products"
  ON public.food_products
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
