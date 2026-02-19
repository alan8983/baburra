-- Create argument-related tables that were missing from the database
-- These were defined in 001_initial_schema.sql but never applied

-- =====================
-- ARGUMENT_CATEGORIES (論點類別)
-- =====================
CREATE TABLE IF NOT EXISTS argument_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sentiment_direction TEXT,
  parent_id UUID REFERENCES argument_categories(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_argument_categories_parent ON argument_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_argument_categories_code ON argument_categories(code);

-- =====================
-- POST_ARGUMENTS (文章論點)
-- =====================
CREATE TABLE IF NOT EXISTS post_arguments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES argument_categories(id),
  original_text TEXT,
  summary TEXT,
  sentiment INTEGER NOT NULL,
  confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_arguments_post ON post_arguments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_arguments_stock ON post_arguments(stock_id);
CREATE INDEX IF NOT EXISTS idx_post_arguments_category ON post_arguments(category_id);

-- =====================
-- STOCK_ARGUMENT_SUMMARY (論點彙整快取)
-- =====================
CREATE TABLE IF NOT EXISTS stock_argument_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES argument_categories(id),
  mention_count INTEGER DEFAULT 0,
  bullish_count INTEGER DEFAULT 0,
  bearish_count INTEGER DEFAULT 0,
  first_mentioned_at TIMESTAMPTZ,
  last_mentioned_at TIMESTAMPTZ,
  avg_sentiment DECIMAL(3,2),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_argument_summary_stock ON stock_argument_summary(stock_id);
CREATE INDEX IF NOT EXISTS idx_stock_argument_summary_category ON stock_argument_summary(category_id);

-- =====================
-- RLS Policies (idempotent: drop if exists before create)
-- =====================
ALTER TABLE argument_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view argument_categories" ON argument_categories;
CREATE POLICY "Authenticated users can view argument_categories"
  ON argument_categories FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE post_arguments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view post_arguments" ON post_arguments;
CREATE POLICY "Authenticated users can view post_arguments"
  ON post_arguments FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create post_arguments" ON post_arguments;
CREATE POLICY "Authenticated users can create post_arguments"
  ON post_arguments FOR INSERT
  TO authenticated
  WITH CHECK (true);

ALTER TABLE stock_argument_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view stock_argument_summary" ON stock_argument_summary;
CREATE POLICY "Authenticated users can view stock_argument_summary"
  ON stock_argument_summary FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage stock_argument_summary" ON stock_argument_summary;
CREATE POLICY "Service role can manage stock_argument_summary"
  ON stock_argument_summary FOR ALL
  TO service_role
  USING (true);

-- =====================
-- Seed argument categories
-- =====================

-- 第一層：父類別
INSERT INTO argument_categories (id, code, name, description, sentiment_direction, parent_id, sort_order) VALUES
  ('00000000-0000-0000-0003-000000000001', 'QUANTITATIVE', '量化', '財務數據、技術指標、估值倍數等可量化分析', 'neutral', NULL, 1),
  ('00000000-0000-0000-0003-000000000005', 'QUALITATIVE', '質化', '市場、競爭優勢、營運品質等質化分析', 'neutral', NULL, 5),
  ('00000000-0000-0000-0003-000000000009', 'EVENT_DRIVEN', '催化劑', '特定時間點事件對股價的驅動', 'neutral', NULL, 9)
ON CONFLICT (id) DO NOTHING;

-- 第二層：量化 (parent: QUANTITATIVE)
INSERT INTO argument_categories (id, code, name, description, sentiment_direction, parent_id, sort_order) VALUES
  ('00000000-0000-0000-0003-000000000002', 'FINANCIALS', '財務體質', '公司的成長率、利潤率等財報內部資訊', 'neutral', '00000000-0000-0000-0003-000000000001', 2),
  ('00000000-0000-0000-0003-000000000003', 'MOMENTUM', '動能類', '價格的成長與交易量，技術分析相關', 'neutral', '00000000-0000-0000-0003-000000000001', 3),
  ('00000000-0000-0000-0003-000000000004', 'VALUATION', '估值', '股價與交易乘數（如 PE 倍數、EV/EBITDA 倍數等）', 'neutral', '00000000-0000-0000-0003-000000000001', 4)
ON CONFLICT (id) DO NOTHING;

-- 第二層：質化 (parent: QUALITATIVE)
INSERT INTO argument_categories (id, code, name, description, sentiment_direction, parent_id, sort_order) VALUES
  ('00000000-0000-0000-0003-000000000006', 'MARKET_SIZE', '市場規模', '公司所在賽道、可觸及市場（TAM）規模、市場 CAGR', 'neutral', '00000000-0000-0000-0003-000000000005', 6),
  ('00000000-0000-0000-0003-000000000007', 'MOAT', '護城河', '技術、規模、許可、專利等競爭優勢', 'neutral', '00000000-0000-0000-0003-000000000005', 7),
  ('00000000-0000-0000-0003-000000000008', 'OPERATIONAL_QUALITY', '營運品質', '與同業比較的利潤率，從護城河或商業模式出發', 'neutral', '00000000-0000-0000-0003-000000000005', 8)
ON CONFLICT (id) DO NOTHING;

-- 第二層：催化劑 (parent: EVENT_DRIVEN)
INSERT INTO argument_categories (id, code, name, description, sentiment_direction, parent_id, sort_order) VALUES
  ('00000000-0000-0000-0003-000000000010', 'CATALYST', '催化劑', '財報、Fed動向、FDA審批等特定時間點事件', 'neutral', '00000000-0000-0000-0003-000000000009', 10)
ON CONFLICT (id) DO NOTHING;
