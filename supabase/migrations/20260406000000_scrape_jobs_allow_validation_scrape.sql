ALTER TABLE scrape_jobs DROP CONSTRAINT IF EXISTS scrape_jobs_job_type_check;
ALTER TABLE scrape_jobs
  ADD CONSTRAINT scrape_jobs_job_type_check
  CHECK (job_type IN ('initial_scrape', 'incremental_check', 'validation_scrape'));
