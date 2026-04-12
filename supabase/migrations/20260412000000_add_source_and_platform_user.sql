-- Add source marker column to kol_sources and posts
-- Allows distinguishing seed-ingested data from organic user contributions

-- 1. Add source column to kol_sources
ALTER TABLE kol_sources
  ADD COLUMN IF NOT EXISTS source TEXT
    CONSTRAINT kol_sources_source_check CHECK (source IN ('seed', 'user'));

-- 2. Add source column to posts
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS source TEXT
    CONSTRAINT posts_source_check CHECK (source IN ('seed', 'user'));

-- 3. Create platform system user for seed-owned rows
-- Uses a deterministic UUID so it can be referenced as a constant in code.
-- ON CONFLICT DO NOTHING makes this idempotent across environments.
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'platform@baburra.com',
  crypt('platform-system-user-no-login', gen_salt('bf')),
  now(),
  now(),
  now(),
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- 4. Create a minimal profile for the platform user so FK constraints are satisfied
INSERT INTO profiles (id, display_name, subscription_tier, credit_balance)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'Baburra Platform',
  'free',
  0
)
ON CONFLICT (id) DO NOTHING;
