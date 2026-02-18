-- Add ai_arguments column to drafts for storing AI-extracted arguments inline
ALTER TABLE drafts ADD COLUMN ai_arguments JSONB DEFAULT NULL;
