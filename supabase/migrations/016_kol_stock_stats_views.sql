-- KOL stats view: post count + last post date per KOL
CREATE OR REPLACE VIEW kol_stats AS
SELECT
  k.id AS kol_id,
  COUNT(p.id)::int AS post_count,
  MAX(p.posted_at) AS last_post_at
FROM kols k
LEFT JOIN posts p ON p.kol_id = k.id
GROUP BY k.id;

-- Stock stats view: post count + last post date per stock
CREATE OR REPLACE VIEW stock_stats AS
SELECT
  s.id AS stock_id,
  COUNT(DISTINCT ps.post_id)::int AS post_count,
  MAX(p.posted_at) AS last_post_at
FROM stocks s
LEFT JOIN post_stocks ps ON ps.stock_id = s.id
LEFT JOIN posts p ON p.id = ps.post_id
GROUP BY s.id;
