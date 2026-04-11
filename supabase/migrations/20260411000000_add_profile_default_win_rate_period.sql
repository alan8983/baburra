-- Add default_win_rate_period column to profiles table
-- Used by the performance metrics UI to anchor each user's local period selectors
-- to a preferred default (5d/30d/90d/365d).
ALTER TABLE profiles
  ADD COLUMN default_win_rate_period TEXT NOT NULL DEFAULT '30d'
  CHECK (default_win_rate_period IN ('5d', '30d', '90d', '365d'));
