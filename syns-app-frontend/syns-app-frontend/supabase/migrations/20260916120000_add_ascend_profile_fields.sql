ALTER TABLE profiles ADD COLUMN IF NOT EXISTS inventory text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS focus_muscles text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS injuries text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS personal_goal text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences text;