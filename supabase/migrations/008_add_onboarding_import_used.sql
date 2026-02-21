-- Add onboarding_import_used flag to profiles
-- Used to grant free AI quota on first KOL batch import
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_import_used BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN profiles.onboarding_import_used IS 'Whether user has used their free onboarding import (first batch import is AI-quota-exempt)';
