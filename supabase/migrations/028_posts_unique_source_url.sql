-- Migration 028: Add unique constraint on posts(source_url, kol_id) to prevent duplicates
-- NULL source_urls (manual posts) are allowed — PostgreSQL UNIQUE allows multiple NULLs

-- Step 1: Remove duplicate posts, keeping the earliest created_at per (source_url, kol_id)
DELETE FROM posts
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY source_url, kol_id ORDER BY created_at ASC) AS rn
    FROM posts
    WHERE source_url IS NOT NULL
  ) dupes
  WHERE rn > 1
);

-- Step 2: Add unique constraint
ALTER TABLE posts
  ADD CONSTRAINT posts_source_url_kol_id_key UNIQUE (source_url, kol_id);
