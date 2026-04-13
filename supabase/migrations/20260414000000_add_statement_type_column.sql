-- Fix: migration 028 recorded as applied but column doesn't physically exist.
-- Using IF NOT EXISTS so this is idempotent.
ALTER TABLE post_arguments
  ADD COLUMN IF NOT EXISTS statement_type TEXT DEFAULT 'mixed';
