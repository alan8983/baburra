-- Scrape Jobs — background job queue for resumable profile scraping

CREATE TABLE IF NOT EXISTS scrape_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_source_id UUID NOT NULL REFERENCES kol_sources(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('initial_scrape', 'incremental_check')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  total_urls INT NOT NULL DEFAULT 0,
  processed_urls INT NOT NULL DEFAULT 0,
  imported_count INT NOT NULL DEFAULT 0,
  duplicate_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  discovered_urls JSONB NOT NULL DEFAULT '[]',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scrape_jobs_status ON scrape_jobs(status)
  WHERE status IN ('queued', 'processing');
CREATE INDEX idx_scrape_jobs_kol_source ON scrape_jobs(kol_source_id);

CREATE TRIGGER update_scrape_jobs_updated_at
  BEFORE UPDATE ON scrape_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on scrape_jobs"
  ON scrape_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
