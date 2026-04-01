-- Migration: Update free tier credit pool from 850 to 700
--
-- Reflects lower Deepgram transcription cost (5 credits/min vs 7).
-- New free tier: 700 credits/week (enough for 2× 60-min videos + articles).
-- Existing free users keep current balance until next weekly reset.

-- Step 1: Update default credit_balance for new users
ALTER TABLE profiles ALTER COLUMN credit_balance SET DEFAULT 700;

-- Step 2: Update consume_credits function — free tier limit 850 → 700
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
  v_weekly_limit INTEGER;
BEGIN
  SELECT credit_balance, credit_reset_at, COALESCE(subscription_tier, 'free')
    INTO v_balance, v_reset, v_tier
    FROM profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  v_weekly_limit := CASE v_tier
    WHEN 'pro' THEN 4200
    WHEN 'max' THEN 21000
    ELSE 700
  END;

  IF v_reset IS NULL OR NOW() >= v_reset THEN
    v_balance := v_weekly_limit;
    v_reset := date_trunc('day', NOW() + INTERVAL '7 days');
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS'
      USING DETAIL = json_build_object(
        'required', p_amount,
        'available', v_balance,
        'operation', p_operation
      )::TEXT;
  END IF;

  v_balance := v_balance - p_amount;

  UPDATE profiles SET
    credit_balance = v_balance,
    credit_reset_at = v_reset
  WHERE id = p_user_id;

  RETURN json_build_object(
    'credit_balance', v_balance,
    'credit_reset_at', v_reset,
    'subscription_tier', v_tier,
    'weekly_limit', v_weekly_limit,
    'consumed', p_amount,
    'operation', p_operation
  );
END;
$$;

-- Step 3: Update refund_credits function — free tier cap 850 → 700
CREATE OR REPLACE FUNCTION refund_credits(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_weekly_limit INTEGER;
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

  v_weekly_limit := CASE v_tier
    WHEN 'pro' THEN 4200
    WHEN 'max' THEN 21000
    ELSE 700
  END;

  UPDATE profiles
  SET credit_balance = LEAST(credit_balance + p_amount, v_weekly_limit)
  WHERE id = p_user_id
  RETURNING credit_balance INTO v_new_balance;

  RETURN json_build_object(
    'credit_balance', v_new_balance,
    'refunded', p_amount
  );
END;
$$;
