-- Expand sentiment from [-2,2] to [-3,3]
-- Existing ±2 → ±3 (strongly), existing ±1 → ±2 (opinion)
-- New ±1 slot reserved for referral (no existing data to migrate)

-- Drop existing constraints first so we can use values outside [-2,2]
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_sentiment_check;
ALTER TABLE post_stocks DROP CONSTRAINT IF EXISTS post_stocks_sentiment_check;
ALTER TABLE post_stocks DROP CONSTRAINT IF EXISTS post_stocks_sentiment_range;
ALTER TABLE post_arguments DROP CONSTRAINT IF EXISTS post_arguments_sentiment_check;

-- IMPORTANT: Must update ±2 → ±3 FIRST, then ±1 → ±2
-- Otherwise ±1 → ±2 would get caught by the subsequent ±2 → ±3 update

-- Posts table
UPDATE posts SET sentiment = 3 WHERE sentiment = 2;
UPDATE posts SET sentiment = -3 WHERE sentiment = -2;
UPDATE posts SET sentiment = 2 WHERE sentiment = 1;
UPDATE posts SET sentiment = -2 WHERE sentiment = -1;

-- Post-stocks table (per-stock sentiment)
UPDATE post_stocks SET sentiment = 3 WHERE sentiment = 2;
UPDATE post_stocks SET sentiment = -3 WHERE sentiment = -2;
UPDATE post_stocks SET sentiment = 2 WHERE sentiment = 1;
UPDATE post_stocks SET sentiment = -2 WHERE sentiment = -1;

-- Post arguments table
UPDATE post_arguments SET sentiment = 3 WHERE sentiment = 2;
UPDATE post_arguments SET sentiment = -3 WHERE sentiment = -2;
UPDATE post_arguments SET sentiment = 2 WHERE sentiment = 1;
UPDATE post_arguments SET sentiment = -2 WHERE sentiment = -1;

-- Add CHECK constraints for new range
ALTER TABLE posts ADD CONSTRAINT posts_sentiment_check CHECK (sentiment BETWEEN -3 AND 3);
ALTER TABLE post_stocks ADD CONSTRAINT post_stocks_sentiment_check CHECK (sentiment BETWEEN -3 AND 3);
ALTER TABLE post_arguments ADD CONSTRAINT post_arguments_sentiment_check CHECK (sentiment BETWEEN -3 AND 3);
