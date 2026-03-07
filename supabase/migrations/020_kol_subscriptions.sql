-- KOL Subscriptions — per-user follow relationship for KOL sources
-- Users can subscribe to KOL sources to get notified of new posts

CREATE TABLE IF NOT EXISTS kol_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kol_source_id UUID NOT NULL REFERENCES kol_sources(id) ON DELETE CASCADE,
  notify_new_posts BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, kol_source_id)
);

ALTER TABLE kol_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subscriptions"
  ON kol_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
