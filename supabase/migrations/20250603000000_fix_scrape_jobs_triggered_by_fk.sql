-- Fix Bug #2: scrape_jobs.triggered_by references auth.users(id) but DEV_USER_ID
-- only exists in profiles. Change FK to reference profiles(id) for consistency
-- with other tables (kols, posts, etc.).

ALTER TABLE scrape_jobs
  DROP CONSTRAINT scrape_jobs_triggered_by_fkey;

ALTER TABLE scrape_jobs
  ADD CONSTRAINT scrape_jobs_triggered_by_fkey
  FOREIGN KEY (triggered_by) REFERENCES profiles(id) ON DELETE SET NULL;
