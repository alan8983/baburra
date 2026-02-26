-- Add Stripe subscription fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ;

-- Index for looking up profiles by Stripe customer ID (webhook handler)
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON profiles (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
