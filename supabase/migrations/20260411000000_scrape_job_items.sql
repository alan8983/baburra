-- Per-URL state machine for scrape jobs.
--
-- Each row in scrape_job_items tracks one URL inside a scrape_jobs row,
-- with a stage enum (`queued`, `discovering`, `downloading`, `transcribing`,
-- `analyzing`, `done`, `failed`) and per-stage progress metadata. This
-- powers the new per-URL progress UI and Supabase Realtime push channel.
--
-- Adds the 'batch_import' job_type so POST /api/import/batch can reuse
-- the scrape-jobs pipeline instead of running a synchronous request.

-- 1. scrape_job_items table --------------------------------------------------

CREATE TABLE IF NOT EXISTS scrape_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES scrape_jobs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  ordinal INT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'queued'
    CHECK (stage IN ('queued', 'discovering', 'downloading', 'transcribing', 'analyzing', 'done', 'failed')),
  bytes_downloaded BIGINT,
  bytes_total BIGINT,
  duration_seconds INT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, ordinal)
);

CREATE INDEX idx_scrape_job_items_job_id ON scrape_job_items(job_id);
CREATE INDEX idx_scrape_job_items_stage ON scrape_job_items(stage)
  WHERE stage IN ('queued', 'discovering', 'downloading', 'transcribing', 'analyzing');

CREATE TRIGGER update_scrape_job_items_updated_at
  BEFORE UPDATE ON scrape_job_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Row-level security ------------------------------------------------------
-- Pattern matches scrape_jobs: the service role (admin client) has full
-- access, and authenticated users can SELECT their own items via the
-- parent job's triggered_by. No direct INSERT/UPDATE for end users;
-- writes go through the pipeline running under the service role.

ALTER TABLE scrape_job_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on scrape_job_items"
  ON scrape_job_items FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users can view their own scrape_job_items"
  ON scrape_job_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scrape_jobs
      WHERE scrape_jobs.id = scrape_job_items.job_id
        AND scrape_jobs.triggered_by = auth.uid()
    )
  );

-- 3. Extend scrape_jobs for the batch_import flow ---------------------------
-- The batch-import route now creates a scrape_jobs row instead of running
-- synchronously. Two schema changes are needed:
--   a) allow the 'batch_import' job_type on the existing check constraint
--   b) relax kol_source_id to NULL because batch imports are user-supplied
--      URLs with no associated KOL source

ALTER TABLE scrape_jobs DROP CONSTRAINT IF EXISTS scrape_jobs_job_type_check;
ALTER TABLE scrape_jobs
  ADD CONSTRAINT scrape_jobs_job_type_check
  CHECK (job_type IN ('initial_scrape', 'incremental_check', 'validation_scrape', 'batch_import'));

ALTER TABLE scrape_jobs ALTER COLUMN kol_source_id DROP NOT NULL;
