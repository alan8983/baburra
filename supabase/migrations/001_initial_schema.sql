-- Stock KOL Tracker Web - Initial Database Schema
-- Version: 1.0
-- Date: 2026-02-01

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy search

-- =====================
-- PROFILES (用戶資料)
-- =====================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  ai_usage_count INTEGER DEFAULT 0,        -- 本週 AI 使用次數
  ai_usage_reset_at TIMESTAMPTZ,           -- 下次重置時間
  subscription_tier TEXT DEFAULT 'free',   -- free | premium
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profile 更新時間觸發器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================
-- KOLS (KOL 名單 - 共享)
-- =====================
CREATE TABLE IF NOT EXISTS kols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,               -- URL-friendly 名稱
  avatar_url TEXT,
  bio TEXT,
  social_links JSONB DEFAULT '{}',         -- {"twitter": "...", "facebook": "..."}
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kols_name ON kols USING gin(name gin_trgm_ops);  -- 模糊搜尋
CREATE INDEX idx_kols_slug ON kols(slug);

CREATE TRIGGER update_kols_updated_at
  BEFORE UPDATE ON kols
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================
-- STOCKS (投資標的 - 共享)
-- =====================
CREATE TABLE IF NOT EXISTS stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT UNIQUE NOT NULL,             -- 股票代碼 (e.g., AAPL, TSLA)
  name TEXT NOT NULL,                      -- 公司名稱
  logo_url TEXT,
  market TEXT DEFAULT 'US',                -- US | TW | HK | CRYPTO
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stocks_ticker ON stocks(ticker);
CREATE INDEX idx_stocks_name ON stocks USING gin(name gin_trgm_ops);
CREATE INDEX idx_stocks_market ON stocks(market);

CREATE TRIGGER update_stocks_updated_at
  BEFORE UPDATE ON stocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================
-- POSTS (文章記錄 - 共享)
-- =====================
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_id UUID NOT NULL REFERENCES kols(id) ON DELETE CASCADE,
  
  -- 內容
  title TEXT,                              -- AI 生成或手動輸入的標題
  content TEXT NOT NULL,                   -- 主文內容
  source_url TEXT,                         -- 原始網址 (用於重複比對)
  source_platform TEXT DEFAULT 'manual',   -- twitter | facebook | manual
  images TEXT[] DEFAULT '{}',              -- Supabase Storage URLs
  
  -- 情緒分析
  sentiment INTEGER NOT NULL,              -- -2(強烈看空) ~ +2(強烈看多)
  sentiment_ai_generated BOOLEAN DEFAULT FALSE,
  
  -- 時間
  posted_at TIMESTAMPTZ NOT NULL,          -- KOL 發文時間
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 歸屬
  created_by UUID REFERENCES profiles(id)
);

-- 唯一約束：同一來源網址只能有一篇文章
CREATE UNIQUE INDEX idx_posts_source_url ON posts(source_url) WHERE source_url IS NOT NULL;

CREATE INDEX idx_posts_kol ON posts(kol_id);
CREATE INDEX idx_posts_posted_at ON posts(posted_at DESC);
CREATE INDEX idx_posts_sentiment ON posts(sentiment);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);

CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================
-- POST_STOCKS (文章-標的關聯 - 多對多)
-- =====================
CREATE TABLE IF NOT EXISTS post_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  
  UNIQUE(post_id, stock_id)
);

CREATE INDEX idx_post_stocks_post ON post_stocks(post_id);
CREATE INDEX idx_post_stocks_stock ON post_stocks(stock_id);

-- =====================
-- STOCK_PRICES (股價快取 - 共享)
-- =====================
CREATE TABLE IF NOT EXISTS stock_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  open DECIMAL(12,4),
  high DECIMAL(12,4),
  low DECIMAL(12,4),
  close DECIMAL(12,4) NOT NULL,
  volume BIGINT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(stock_id, date)
);

CREATE INDEX idx_stock_prices_stock_date ON stock_prices(stock_id, date DESC);

-- =====================
-- DRAFTS (草稿 - 私有)
-- =====================
CREATE TABLE IF NOT EXISTS drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- 草稿內容 (與 posts 類似但允許部分為空)
  kol_id UUID REFERENCES kols(id),
  kol_name_input TEXT,                     -- 尚未選定 KOL 時的暫存
  content TEXT,
  source_url TEXT,
  images TEXT[] DEFAULT '{}',
  sentiment INTEGER,
  posted_at TIMESTAMPTZ,
  stock_ids UUID[] DEFAULT '{}',
  stock_name_inputs TEXT[] DEFAULT '{}',   -- 尚未選定 Stock 時的暫存
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drafts_user ON drafts(user_id);

CREATE TRIGGER update_drafts_updated_at
  BEFORE UPDATE ON drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================
-- BOOKMARKS (書籤 - 私有)
-- =====================
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, post_id)
);

CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_post ON bookmarks(post_id);

-- =====================
-- ARGUMENT_CATEGORIES (論點類別 - Phase 8)
-- =====================
CREATE TABLE IF NOT EXISTS argument_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,               -- e.g., 'VALUATION', 'GROWTH', 'RISK'
  name TEXT NOT NULL,                      -- 顯示名稱
  description TEXT,
  sentiment_direction TEXT,                -- 'bullish' | 'bearish' | 'neutral'
  parent_id UUID REFERENCES argument_categories(id),  -- 支援階層
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_argument_categories_parent ON argument_categories(parent_id);
CREATE INDEX idx_argument_categories_code ON argument_categories(code);

-- =====================
-- POST_ARGUMENTS (文章論點 - Phase 8)
-- =====================
CREATE TABLE IF NOT EXISTS post_arguments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES argument_categories(id),
  
  -- AI 提取內容
  original_text TEXT,                      -- 原文摘錄
  summary TEXT,                            -- AI 摘要
  sentiment INTEGER NOT NULL,              -- -2 ~ +2 (此論點的情緒強度)
  confidence DECIMAL(3,2),                 -- AI 信心度 0~1
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_post_arguments_post ON post_arguments(post_id);
CREATE INDEX idx_post_arguments_stock ON post_arguments(stock_id);
CREATE INDEX idx_post_arguments_category ON post_arguments(category_id);

-- =====================
-- STOCK_ARGUMENT_SUMMARY (論點彙整快取 - Phase 8)
-- =====================
CREATE TABLE IF NOT EXISTS stock_argument_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES argument_categories(id),
  
  -- 統計資料
  mention_count INTEGER DEFAULT 0,           -- 被提及次數
  bullish_count INTEGER DEFAULT 0,           -- 看多次數
  bearish_count INTEGER DEFAULT 0,           -- 看空次數
  first_mentioned_at TIMESTAMPTZ,            -- 首次提及時間
  last_mentioned_at TIMESTAMPTZ,             -- 最近提及時間
  avg_sentiment DECIMAL(3,2),                -- 平均情緒
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(stock_id, category_id)
);

CREATE INDEX idx_stock_argument_summary_stock ON stock_argument_summary(stock_id);
CREATE INDEX idx_stock_argument_summary_category ON stock_argument_summary(category_id);

-- =====================
-- EDIT_SUGGESTIONS (編輯建議 - Release 01)
-- =====================
CREATE TABLE IF NOT EXISTS edit_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,               -- 'kol' | 'post' | 'stock'
  target_id UUID NOT NULL,
  suggested_by UUID REFERENCES profiles(id),
  suggestion_type TEXT NOT NULL,           -- 'edit' | 'merge' | 'delete'
  suggestion_data JSONB NOT NULL,          -- 建議的修改內容
  status TEXT DEFAULT 'pending',           -- pending | approved | rejected
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_edit_suggestions_target ON edit_suggestions(target_type, target_id);
CREATE INDEX idx_edit_suggestions_status ON edit_suggestions(status);

-- =====================
-- RLS POLICIES (暫時停用，開發階段)
-- =====================
-- 注意：開發期間 RLS 政策已定義但暫不啟用
-- 待 Phase 1 (認證系統) 完成後再啟用

-- Profiles RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- KOLs RLS (共享資料，登入用戶皆可讀取)
ALTER TABLE kols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view kols"
  ON kols FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create kols"
  ON kols FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Creators can update their kols"
  ON kols FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

-- Stocks RLS
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stocks"
  ON stocks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create stocks"
  ON stocks FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Posts RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view posts"
  ON posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create posts"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Creators can update their posts"
  ON posts FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Creators can delete their posts"
  ON posts FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Post_Stocks RLS
ALTER TABLE post_stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view post_stocks"
  ON post_stocks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create post_stocks"
  ON post_stocks FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Stock_Prices RLS (只有 Service Role 可寫入)
ALTER TABLE stock_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stock_prices"
  ON stock_prices FOR SELECT
  TO authenticated
  USING (true);

-- Drafts RLS (私有資料)
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own drafts"
  ON drafts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own drafts"
  ON drafts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own drafts"
  ON drafts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own drafts"
  ON drafts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Bookmarks RLS (私有資料)
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmarks"
  ON bookmarks FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own bookmarks"
  ON bookmarks FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own bookmarks"
  ON bookmarks FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- =====================
-- FUNCTIONS (輔助函數)
-- =====================

-- 建立 slug 函數
CREATE OR REPLACE FUNCTION generate_slug(name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(regexp_replace(name, '[^a-zA-Z0-9\u4e00-\u9fa5]+', '-', 'g'));
END;
$$ LANGUAGE plpgsql;

-- 自動產生新用戶的 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 新用戶註冊時自動建立 profile
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================
-- DEVELOPMENT: 暫時停用 RLS (開發階段)
-- =====================
-- 開發期間可以選擇暫時停用 RLS，使用 Service Role Key
-- 取消下面的註解來停用 RLS

-- ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE kols DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE stocks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE posts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE post_stocks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE stock_prices DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE drafts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE bookmarks DISABLE ROW LEVEL SECURITY;
