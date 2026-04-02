-- Migration: Open Beta Launch
--
-- 1. Add profiles.status column (active/waitlisted) with backfill
-- 2. Set Postgres custom settings: app.billing_mode, app.user_cap
-- 3. Update handle_new_user() trigger with waitlist cap enforcement
-- 4. Update consume_credits() RPC with beta mode override (5000 limit)
-- 5. Update refund_credits() RPC with beta mode override

-- =============================================================================
-- 1. Add profiles.status column
-- =============================================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE profiles
  ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'waitlisted'));

-- Backfill: all existing profiles are active
UPDATE profiles SET status = 'active' WHERE status IS NULL;

-- =============================================================================
-- 2. Postgres custom settings for billing mode and user cap
-- =============================================================================
-- These settings are readable by RPCs via current_setting('app.billing_mode', true).
-- Supabase does not allow ALTER DATABASE SET (requires superuser).
-- When unset, current_setting returns NULL — RPCs treat NULL as 'production'.
-- To activate beta mode, set via Supabase Dashboard > SQL Editor:
--   ALTER ROLE postgres SET app.billing_mode = 'beta';
--   ALTER ROLE postgres SET app.user_cap = '100';
-- Or set per-session in application code if needed.

-- =============================================================================
-- 3. Update handle_new_user() trigger — waitlist cap enforcement
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_cap INTEGER;
  v_active_count INTEGER;
  v_status TEXT;
BEGIN
  -- Read user cap from Postgres custom setting (default 100)
  v_cap := COALESCE(current_setting('app.user_cap', true)::INTEGER, 100);

  -- Use advisory lock to serialize concurrent registrations
  PERFORM pg_advisory_xact_lock(hashtext('handle_new_user_cap'));

  -- Count current active profiles
  SELECT COUNT(*) INTO v_active_count
    FROM public.profiles
   WHERE status = 'active';

  -- Determine status based on cap
  IF v_active_count >= v_cap THEN
    v_status := 'waitlisted';
  ELSE
    v_status := 'active';
  END IF;

  INSERT INTO public.profiles (id, display_name, avatar_url, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    v_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 4. Update consume_credits() — beta mode uses 5000 weekly limit
-- =============================================================================
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
  v_billing_mode TEXT;
BEGIN
  SELECT credit_balance, credit_reset_at, COALESCE(subscription_tier, 'free')
    INTO v_balance, v_reset, v_tier
    FROM profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  -- Check billing mode: beta overrides all tiers to 5000
  v_billing_mode := current_setting('app.billing_mode', true);
  IF v_billing_mode = 'beta' THEN
    v_weekly_limit := 5000;
  ELSE
    v_weekly_limit := CASE v_tier
      WHEN 'pro' THEN 4200
      WHEN 'max' THEN 21000
      ELSE 700
    END;
  END IF;

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

-- =============================================================================
-- 5. Update refund_credits() — beta mode caps at 5000
-- =============================================================================
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
  v_billing_mode TEXT;
BEGIN
  SELECT COALESCE(subscription_tier, 'free')
    INTO v_tier
    FROM profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  -- Check billing mode: beta overrides all tiers to 5000
  v_billing_mode := current_setting('app.billing_mode', true);
  IF v_billing_mode = 'beta' THEN
    v_weekly_limit := 5000;
  ELSE
    v_weekly_limit := CASE v_tier
      WHEN 'pro' THEN 4200
      WHEN 'max' THEN 21000
      ELSE 700
    END;
  END IF;

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
