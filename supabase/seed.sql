-- Stock KOL Tracker Web - Seed Data
-- 開發測試用初始資料

-- =====================
-- 測試用 KOL 資料
-- =====================
INSERT INTO kols (id, name, slug, bio, social_links) VALUES
  ('00000000-0000-0000-0000-000000000001', '股癌', 'gu-ai', '專注美股分析，分享投資心得與市場觀察。', '{"twitter": "https://twitter.com/example1", "youtube": "https://youtube.com/example1"}'),
  ('00000000-0000-0000-0000-000000000002', '財報狗', 'cai-bao-gou', '用數據說話，專業財報分析。', '{"website": "https://example.com"}'),
  ('00000000-0000-0000-0000-000000000003', '艾蜜莉', 'ai-mi-li', '小資女的投資日記，長期價值投資。', '{"facebook": "https://facebook.com/example"}'),
  ('00000000-0000-0000-0000-000000000004', '老王愛說笑', 'lao-wang', '幽默風趣的股市觀察家。', '{}')
ON CONFLICT (id) DO NOTHING;

-- =====================
-- 測試用 Stock 資料
-- =====================
INSERT INTO stocks (id, ticker, name, market) VALUES
  ('00000000-0000-0000-0001-000000000001', 'AAPL', 'Apple Inc.', 'US'),
  ('00000000-0000-0000-0001-000000000002', 'TSLA', 'Tesla Inc.', 'US'),
  ('00000000-0000-0000-0001-000000000003', 'NVDA', 'NVIDIA Corp.', 'US'),
  ('00000000-0000-0000-0001-000000000004', 'MSFT', 'Microsoft Corp.', 'US'),
  ('00000000-0000-0000-0001-000000000005', 'AMZN', 'Amazon.com Inc.', 'US'),
  ('00000000-0000-0000-0001-000000000006', 'GOOGL', 'Alphabet Inc.', 'US'),
  ('00000000-0000-0000-0001-000000000007', 'META', 'Meta Platforms Inc.', 'US'),
  ('00000000-0000-0000-0001-000000000008', 'AMD', 'Advanced Micro Devices Inc.', 'US'),
  ('00000000-0000-0000-0001-000000000009', 'INTC', 'Intel Corp.', 'US')
ON CONFLICT (id) DO NOTHING;

-- =====================
-- 測試用 Post 資料
-- =====================
INSERT INTO posts (id, kol_id, content, sentiment, sentiment_ai_generated, posted_at, source_platform) VALUES
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', 
   '蘋果第四季財報表現優異，AI 功能推動 iPhone 銷量成長。服務營收持續創新高，看好長期發展。', 
   1, false, '2026-01-30 14:30:00+08', 'manual'),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000002', 
   'NVIDIA 在 AI 領域的領先地位持續鞏固，資料中心營收創新高，強烈看好 2026 年表現。', 
   2, true, '2026-01-29 10:15:00+08', 'twitter'),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000003', 
   '微軟 Azure 成長放緩，但 AI 整合帶來新機會。估值合理但不便宜，中立看待。', 
   0, false, '2026-01-28 16:45:00+08', 'facebook'),
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000001', 
   '特斯拉毛利率持續受壓，價格戰影響明顯。短期謹慎，但 FSD 進展值得關注。', 
   -1, true, '2026-01-27 09:00:00+08', 'manual')
ON CONFLICT (id) DO NOTHING;

-- =====================
-- 關聯 Post 與 Stock
-- =====================
INSERT INTO post_stocks (post_id, stock_id) VALUES
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0001-000000000001'), -- Post 1 -> AAPL
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-000000000003'), -- Post 2 -> NVDA
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0001-000000000004'), -- Post 3 -> MSFT
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0001-000000000002')  -- Post 4 -> TSLA
ON CONFLICT DO NOTHING;

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
