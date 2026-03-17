-- Remove onboarding system: replace with simpler first_import_free flag

-- Step 1: Add new column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_import_free BOOLEAN DEFAULT TRUE;

-- Step 2: Migrate data — users who already used onboarding import should NOT get another free import
UPDATE profiles SET first_import_free = FALSE WHERE onboarding_import_used = TRUE;

-- Step 3: Drop onboarding columns
ALTER TABLE profiles DROP COLUMN IF EXISTS onboarding_completed;
ALTER TABLE profiles DROP COLUMN IF EXISTS onboarding_completed_at;
ALTER TABLE profiles DROP COLUMN IF EXISTS onboarding_import_used;
