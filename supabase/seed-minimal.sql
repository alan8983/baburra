-- Stock KOL Tracker Web - Minimal Seed (無假資料)
-- 僅含參考資料，供「手動測試、無預建假內容」環境使用。
-- 使用方式見 docs/MANUAL_TESTING_SETUP.md

-- =====================
-- 論點類別 (Phase 8 - 依 ANALYSIS_FRAMEWORK.md 定義)
-- =====================
-- 第一層：分析維度
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
