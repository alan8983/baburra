-- Add source tracking columns to post_stocks table
ALTER TABLE post_stocks
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'explicit',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT;
