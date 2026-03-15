-- Migration 030: Create transcripts table for YouTube video transcript caching
-- Transcripts are keyed by source_url and shared across all users.
-- The first user to request a video pays the Gemini API cost;
-- subsequent users get it from cache (our cost = $0).

CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  source VARCHAR(20) NOT NULL, -- 'caption' | 'gemini'
  language VARCHAR(10),
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transcripts_source_url ON transcripts(source_url);

-- Enable RLS but allow admin client to bypass
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
