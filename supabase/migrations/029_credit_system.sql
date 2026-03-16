-- Migration 029: Replace flat quota system with variable-cost credit system
--
-- Old system: ai_usage_count (+1 per action), subscription_tier ('free'|'premium')
-- New system: credit_balance (variable cost), subscription_tier ('free'|'pro'|'max')
-- Credit limits: free=850/wk, pro=4200/wk, max=21000/wk

-- Step 1: Add new credit columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credit_balance INTEGER DEFAULT 850;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credit_reset_at TIMESTAMPTZ;

-- Step 2: Migrate existing data
UPDATE profiles SET
  credit_balance = CASE
    WHEN subscription_tier = 'premium' THEN 4200
    ELSE 850
  END,
  credit_reset_at = ai_usage_reset_at,
  subscription_tier = CASE
    WHEN subscription_tier = 'premium' THEN 'pro'
    ELSE COALESCE(subscription_tier, 'free')
  END;

-- Step 3: Create consume_credits RPC function
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
  -- Lock the row to prevent concurrent updates
  SELECT credit_balance, credit_reset_at, COALESCE(subscription_tier, 'free')
    INTO v_balance, v_reset, v_tier
    FROM profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  -- Determine weekly limit based on tier
  v_weekly_limit := CASE v_tier
    WHEN 'pro' THEN 4200
    WHEN 'max' THEN 21000
    ELSE 850
  END;

  -- Reset if past reset date or first use
  IF v_reset IS NULL OR NOW() >= v_reset THEN
    v_balance := v_weekly_limit;
    v_reset := date_trunc('day', NOW() + INTERVAL '7 days');
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

-- Step 4: Create refund_credits RPC function
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
    ELSE 850
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

-- Step 5: Drop old columns and functions (after data migration)
ALTER TABLE profiles DROP COLUMN IF EXISTS ai_usage_count;
ALTER TABLE profiles DROP COLUMN IF EXISTS ai_usage_reset_at;
DROP FUNCTION IF EXISTS consume_ai_quota(UUID);
DROP FUNCTION IF EXISTS refund_ai_quota(UUID);

-- Step 6: Add non-negative constraint on credit_balance
ALTER TABLE profiles ADD CONSTRAINT profiles_credit_balance_non_negative CHECK (credit_balance >= 0);
