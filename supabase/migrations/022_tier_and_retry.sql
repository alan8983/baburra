-- Migration 022: Add profiles.tier and scrape_jobs.retry_count
-- profiles.tier: user subscription tier ('free' | 'paid')
-- scrape_jobs.retry_count: number of retry attempts for failed jobs

-- Add tier column to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'
  CHECK (tier IN ('free', 'paid'));

-- Add retry_count column to scrape_jobs
ALTER TABLE scrape_jobs
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

-- Add 'permanently_failed' to scrape_jobs status check
-- First drop existing constraint, then re-add with new value
ALTER TABLE scrape_jobs DROP CONSTRAINT IF EXISTS scrape_jobs_status_check;
ALTER TABLE scrape_jobs
  ADD CONSTRAINT scrape_jobs_status_check
  CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'permanently_failed'));
