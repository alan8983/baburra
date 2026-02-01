-- Stock KOL Tracker Web - Enable RLS Policies
-- Version: 1.0
-- Date: 2026-02-01
-- Purpose: 啟用 RLS 政策並補充缺少的政策

-- =====================
-- ARGUMENT_CATEGORIES RLS
-- =====================
ALTER TABLE argument_categories ENABLE ROW LEVEL SECURITY;

-- 所有認證用戶可以讀取論點類別（這是公開資料）
CREATE POLICY "Authenticated users can view argument_categories"
  ON argument_categories FOR SELECT
  TO authenticated
  USING (true);

-- =====================
-- POST_ARGUMENTS RLS
-- =====================
ALTER TABLE post_arguments ENABLE ROW LEVEL SECURITY;

-- 所有認證用戶可以讀取論點
CREATE POLICY "Authenticated users can view post_arguments"
  ON post_arguments FOR SELECT
  TO authenticated
  USING (true);

-- 認證用戶可以建立論點（透過 AI 分析）
CREATE POLICY "Authenticated users can create post_arguments"
  ON post_arguments FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =====================
-- STOCK_ARGUMENT_SUMMARY RLS
-- =====================
ALTER TABLE stock_argument_summary ENABLE ROW LEVEL SECURITY;

-- 所有認證用戶可以讀取論點彙整
CREATE POLICY "Authenticated users can view stock_argument_summary"
  ON stock_argument_summary FOR SELECT
  TO authenticated
  USING (true);

-- =====================
-- EDIT_SUGGESTIONS RLS
-- =====================
ALTER TABLE edit_suggestions ENABLE ROW LEVEL SECURITY;

-- 認證用戶可以讀取編輯建議
CREATE POLICY "Authenticated users can view edit_suggestions"
  ON edit_suggestions FOR SELECT
  TO authenticated
  USING (true);

-- 認證用戶可以建立編輯建議
CREATE POLICY "Authenticated users can create edit_suggestions"
  ON edit_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 只有建議者可以取消自己的建議
CREATE POLICY "Users can cancel own suggestions"
  ON edit_suggestions FOR UPDATE
  TO authenticated
  USING (suggested_by = auth.uid() AND status = 'pending');

-- =====================
-- 確保所有表都啟用 RLS
-- =====================

-- 確認核心表的 RLS 狀態
DO $$
BEGIN
  -- 這些表應該都已啟用 RLS，這裡只是確認
  EXECUTE 'ALTER TABLE profiles ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE kols ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE stocks ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE posts ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE post_stocks ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE stock_prices ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE drafts ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY';
END
$$;

-- =====================
-- SERVICE ROLE 權限
-- =====================

-- stock_prices 表只允許 service_role 寫入（用於股價快取）
CREATE POLICY "Service role can insert stock_prices"
  ON stock_prices FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update stock_prices"
  ON stock_prices FOR UPDATE
  TO service_role
  USING (true);

-- stock_argument_summary 允許 service_role 完整操作
CREATE POLICY "Service role can manage stock_argument_summary"
  ON stock_argument_summary FOR ALL
  TO service_role
  USING (true);

-- =====================
-- 補充：允許 anon 讀取公開資料（可選，用於未登入用戶瀏覽）
-- =====================

-- 如果需要允許未登入用戶瀏覽部分公開資料，可以啟用以下政策
-- 目前設計為需要登入才能使用，所以暫時不啟用

-- CREATE POLICY "Anyone can view kols"
--   ON kols FOR SELECT
--   TO anon
--   USING (true);

-- CREATE POLICY "Anyone can view stocks"
--   ON stocks FOR SELECT
--   TO anon
--   USING (true);

-- CREATE POLICY "Anyone can view posts"
--   ON posts FOR SELECT
--   TO anon
--   USING (true);
