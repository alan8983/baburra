-- Add per-stock sentiment to post_stocks junction table
-- NULL means "use the post-level sentiment" (backward-compatible)
ALTER TABLE post_stocks ADD COLUMN sentiment INTEGER;

ALTER TABLE post_stocks ADD CONSTRAINT post_stocks_sentiment_range
  CHECK (sentiment IS NULL OR (sentiment >= -2 AND sentiment <= 2));

-- Add stock_sentiments JSONB to drafts for AI-derived per-ticker sentiments
ALTER TABLE drafts ADD COLUMN stock_sentiments JSONB;
