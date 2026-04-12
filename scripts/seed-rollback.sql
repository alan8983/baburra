-- Rollback seed data: removes all rows created by the seed scrape script.
-- The source column and platform user remain — they're harmless.
--
-- Usage:
--   psql <connection-string> -f scripts/seed-rollback.sql

BEGIN;

-- 1. Delete post arguments for seed posts
DELETE FROM post_arguments
WHERE post_id IN (SELECT id FROM posts WHERE source = 'seed');

-- 2. Delete post_stocks for seed posts
DELETE FROM post_stocks
WHERE post_id IN (SELECT id FROM posts WHERE source = 'seed');

-- 3. Delete seed posts
DELETE FROM posts WHERE source = 'seed';

-- 4. Delete scrape jobs linked to seed kol_sources
DELETE FROM scrape_jobs
WHERE kol_source_id IN (SELECT id FROM kol_sources WHERE source = 'seed');

-- 5. Delete seed kol_sources
DELETE FROM kol_sources WHERE source = 'seed';

-- 6. Delete orphaned KOLs (KOLs created by the platform user with no remaining sources)
DELETE FROM kols
WHERE created_by = 'a0000000-0000-4000-8000-000000000001'
  AND id NOT IN (SELECT kol_id FROM kol_sources);

COMMIT;
