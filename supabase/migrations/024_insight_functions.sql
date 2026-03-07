-- Phase 16: Community Insights — anonymous aggregation RPC functions

CREATE OR REPLACE FUNCTION get_trending_stocks(p_days INT DEFAULT 7, p_limit INT DEFAULT 10)
RETURNS TABLE(stock_id UUID, ticker TEXT, name TEXT, post_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT s.id, s.ticker, s.name, COUNT(DISTINCT ps.post_id)
  FROM post_stocks ps
  JOIN stocks s ON s.id = ps.stock_id
  JOIN posts p ON p.id = ps.post_id
  WHERE p.posted_at >= (NOW() - (p_days || ' days')::INTERVAL)
  GROUP BY s.id, s.ticker, s.name
  ORDER BY COUNT(DISTINCT ps.post_id) DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_popular_kols(p_limit INT DEFAULT 10)
RETURNS TABLE(kol_id UUID, name TEXT, avatar_url TEXT, follower_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT k.id, k.name, k.avatar_url, COUNT(DISTINCT ks.user_id)
  FROM kol_subscriptions ks
  JOIN kol_sources src ON src.id = ks.kol_source_id
  JOIN kols k ON k.id = src.kol_id
  GROUP BY k.id, k.name, k.avatar_url
  ORDER BY COUNT(DISTINCT ks.user_id) DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_kol_follower_count(p_kol_id UUID)
RETURNS BIGINT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(COUNT(DISTINCT ks.user_id), 0)
  FROM kol_subscriptions ks
  JOIN kol_sources src ON src.id = ks.kol_source_id
  WHERE src.kol_id = p_kol_id;
$$;
