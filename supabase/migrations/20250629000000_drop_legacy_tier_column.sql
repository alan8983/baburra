-- Drop legacy profiles.tier column (from migration 022)
-- Replaced by profiles.subscription_tier (from migration 029 / 001)
-- The old column used 'free'|'paid'; the new column uses 'free'|'pro'|'max'

ALTER TABLE profiles DROP COLUMN IF EXISTS tier;
