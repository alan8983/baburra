-- D2 fix (#89): create_post_atomic must persist posts.source so that
-- seed-tracked posts are distinguishable from user-imported posts.
-- Without this, scripts/seed-rollback.sql (filters on `source = 'seed'`)
-- cannot find seed-imported posts and rollback is impossible.
--
-- Adds p_source parameter (default NULL preserves prior behavior for
-- non-seed callers). DROP + CREATE because PG can't change a function's
-- argument list via CREATE OR REPLACE.

DROP FUNCTION IF EXISTS create_post_atomic(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], INTEGER, BOOLEAN, TIMESTAMPTZ, UUID, JSONB, JSONB, TEXT, TEXT
);

CREATE FUNCTION create_post_atomic(
  p_kol_id UUID,
  p_title TEXT,
  p_content TEXT,
  p_source_url TEXT,
  p_source_platform TEXT,
  p_images TEXT[],
  p_sentiment INTEGER,
  p_sentiment_ai_generated BOOLEAN,
  p_posted_at TIMESTAMPTZ,
  p_created_by UUID,
  p_stocks JSONB DEFAULT '[]'::JSONB,
  p_arguments JSONB DEFAULT '[]'::JSONB,
  p_ai_model_version TEXT DEFAULT NULL,
  p_content_fingerprint TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_post_id UUID;
  v_stock JSONB;
  v_arg_group JSONB;
  v_arg JSONB;
  v_category_id UUID;
  v_post_row RECORD;
BEGIN
  -- 1. Insert post (now with source)
  INSERT INTO posts (kol_id, title, content, source_url, source_platform, images,
                     sentiment, sentiment_ai_generated, posted_at, created_by,
                     ai_model_version, content_fingerprint, source)
  VALUES (p_kol_id, p_title, p_content, p_source_url, p_source_platform, p_images,
          p_sentiment, p_sentiment_ai_generated, p_posted_at, p_created_by,
          p_ai_model_version, p_content_fingerprint, p_source)
  RETURNING * INTO v_post_row;

  v_post_id := v_post_row.id;

  -- 2. Insert post_stocks with source tracking (unchanged)
  IF jsonb_array_length(p_stocks) > 0 THEN
    INSERT INTO post_stocks (post_id, stock_id, sentiment, source, inference_reason)
    SELECT v_post_id,
           (s->>'stock_id')::UUID,
           (s->>'sentiment')::INTEGER,
           COALESCE(s->>'source', 'explicit'),
           s->>'inference_reason'
    FROM jsonb_array_elements(p_stocks) AS s;
  END IF;

  -- 3. Insert post_arguments with category code resolution (unchanged)
  IF jsonb_array_length(p_arguments) > 0 THEN
    FOR v_arg_group IN SELECT * FROM jsonb_array_elements(p_arguments)
    LOOP
      FOR v_arg IN SELECT * FROM jsonb_array_elements(v_arg_group->'arguments')
      LOOP
        SELECT id INTO v_category_id
        FROM argument_categories
        WHERE code = v_arg->>'category_code';

        IF v_category_id IS NOT NULL THEN
          INSERT INTO post_arguments (post_id, stock_id, category_id, original_text, summary, sentiment, confidence, statement_type)
          VALUES (
            v_post_id,
            (v_arg->>'stock_id')::UUID,
            v_category_id,
            v_arg->>'original_text',
            v_arg->>'summary',
            (v_arg->>'sentiment')::INTEGER,
            (v_arg->>'confidence')::DECIMAL,
            COALESCE(v_arg->>'statement_type', 'mixed')
          );
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  RETURN to_jsonb(v_post_row);
END;
$$;
