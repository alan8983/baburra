-- KOL Sources — links KOL to platform identity for profile scraping
-- Tracks scrape state and monitoring configuration

-- Ensure the shared trigger function exists (defined in 001_initial_schema)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS kol_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_id UUID NOT NULL REFERENCES kols(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_id TEXT NOT NULL,
  platform_url TEXT NOT NULL,
  scrape_status TEXT NOT NULL DEFAULT 'pending',
  last_scraped_at TIMESTAMPTZ,
  posts_scraped_count INT NOT NULL DEFAULT 0,
  monitoring_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  monitor_frequency_hours INT NOT NULL DEFAULT 24,
  next_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform, platform_id)
);

CREATE INDEX idx_kol_sources_kol_id ON kol_sources(kol_id);
CREATE INDEX idx_kol_sources_monitoring ON kol_sources(monitoring_enabled, next_check_at)
  WHERE monitoring_enabled = TRUE;

CREATE TRIGGER update_kol_sources_updated_at
  BEFORE UPDATE ON kol_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE kol_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on kol_sources"
  ON kol_sources FOR ALL TO service_role USING (true) WITH CHECK (true);
