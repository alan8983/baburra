-- A/B experiment event tracking
-- Lightweight funnel tracking for conversion experiments

CREATE TABLE IF NOT EXISTS ab_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment TEXT NOT NULL,
  variant TEXT NOT NULL,
  anonymous_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analysis queries
CREATE INDEX idx_ab_events_experiment ON ab_events(experiment);
CREATE INDEX idx_ab_events_variant ON ab_events(experiment, variant);
CREATE INDEX idx_ab_events_anonymous_id ON ab_events(anonymous_id) WHERE anonymous_id IS NOT NULL;
CREATE INDEX idx_ab_events_user_id ON ab_events(user_id) WHERE user_id IS NOT NULL;

-- RLS enabled, no policies = admin client only (no direct client access)
ALTER TABLE ab_events ENABLE ROW LEVEL SECURITY;
