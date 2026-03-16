-- Add filtered_count column to scrape_jobs for tracking irrelevant content
ALTER TABLE scrape_jobs ADD COLUMN filtered_count integer NOT NULL DEFAULT 0;
