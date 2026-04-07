-- Migration 031: Monthly credits + content_unlocks table (tier-layer-unlocks change)
--
-- Changes:
--   1. Replace weekly credit reset (7-day rolling) with calendar-month reset
--   2. Rescale tier credit allotments: free=500, pro=5000, max=25000 per month (calibrated 2026-04-08)
--   3. Add content_unlocks table for persistent per-user L2/L3 unlocks
--   4. Hard-reset all existing profiles to Free tier with new allotment
--
-- Calibration basis: 60-day telemetry (2026-04-08):
--   - 21 users, all free tier; avg caption transcript 17min; avg gemini 15min; 1 deepgram 50min.
--   - Typical caption-based KOL scrape ~10 credits; gemini-heavy ~375; deepgram heavy ~250-400.
--   - Free 500: enough for quick-input + 3 free L2 unlocks, no scraping expected.
--   - Pro 5000: ~20-30 caption scrapes OR ~50 L3 unlocks.
--   - Max 25000: ceiling for heavy-scrape power users.

-- ──────────────────────────────────────────────────────────────────────────
-- Step 1: content_unlocks table
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unlock_type TEXT NOT NULL CHECK (unlock_type IN ('kol_ticker', 'stock_page')),
  -- For kol_ticker: "{kol_id}:{stock_id}". For stock_page: "{stock_id}".
  target_key TEXT NOT NULL,
  credits_paid INTEGER NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, unlock_type, target_key)
);

CREATE INDEX IF NOT EXISTS content_unlocks_user_type_idx
  ON content_unlocks (user_id, unlock_type);

-- RLS: user can read their own unlocks; writes go through admin client from API routes.
ALTER TABLE content_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_unlocks_select_own" ON content_unlocks;
CREATE POLICY "content_unlocks_select_own" ON content_unlocks
  FOR SELECT USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- Step 2: Replace consume_credits RPC — monthly reset
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION consume_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_operation TEXT DEFAULT 'unknown'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance INTEGER;
  v_reset TIMESTAMPTZ;
  v_tier TEXT;
  v_monthly_limit INTEGER;
  v_month_start TIMESTAMPTZ;
BEGIN
  -- Lock the row to prevent concurrent updates
  SELECT credit_balance, credit_reset_at, COALESCE(subscription_tier, 'free')
    INTO v_balance, v_reset, v_tier
    FROM profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  -- Determine monthly limit based on tier (PLACEHOLDERS — calibrate before deploy)
  v_monthly_limit := CASE v_tier
    WHEN 'pro' THEN 5000
    WHEN 'max' THEN 25000
    ELSE 500
  END;

  v_month_start := date_trunc('month', NOW());

  -- Reset if credit_reset_at is NULL or falls before the start of the current month
  IF v_reset IS NULL OR v_reset < v_month_start THEN
    v_balance := v_monthly_limit;
    v_reset := NOW();
  END IF;

  -- Check sufficient credits
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS'
      USING DETAIL = json_build_object(
        'required', p_amount,
        'available', v_balance,
        'operation', p_operation
      )::TEXT;
  END IF;

  -- Deduct credits
  v_balance := v_balance - p_amount;

  UPDATE profiles SET
    credit_balance = v_balance,
    credit_reset_at = v_reset
  WHERE id = p_user_id;

  -- Return shape: keep "weekly_limit" key for backward-compat with callers
  -- (ai-usage.repository.ts et al.) — semantically it's monthly now.
  RETURN json_build_object(
    'credit_balance', v_balance,
    'credit_reset_at', v_reset,
    'subscription_tier', v_tier,
    'weekly_limit', v_monthly_limit,
    'monthly_limit', v_monthly_limit,
    'consumed', p_amount,
    'operation', p_operation
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- Step 3: Replace refund_credits RPC — cap at monthly limit
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refund_credits(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_monthly_limit INTEGER;
  v_new_balance INTEGER;
  v_tier TEXT;
BEGIN
  SELECT COALESCE(subscription_tier, 'free')
    INTO v_tier
    FROM profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  v_monthly_limit := CASE v_tier
    WHEN 'pro' THEN 5000
    WHEN 'max' THEN 25000
    ELSE 500
  END;

  UPDATE profiles
  SET credit_balance = LEAST(credit_balance + p_amount, v_monthly_limit)
  WHERE id = p_user_id
  RETURNING credit_balance INTO v_new_balance;

  RETURN json_build_object(
    'credit_balance', v_new_balance,
    'refunded', p_amount
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- Step 4: Hard reset all existing profiles to Free tier with new allotment
-- ──────────────────────────────────────────────────────────────────────────

UPDATE profiles SET
  subscription_tier = 'free',
  credit_balance = 500,
  credit_reset_at = NOW();
