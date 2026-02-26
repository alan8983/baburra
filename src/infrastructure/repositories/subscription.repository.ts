/**
 * Subscription Repository — Stripe 訂閱資料存取
 */

import { createAdminClient } from '@/infrastructure/supabase/admin';

export interface SubscriptionData {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionTier: 'free' | 'premium';
  subscriptionPeriodEnd: Date | null;
}

/**
 * 取得用戶的訂閱資訊
 */
export async function getSubscription(userId: string): Promise<SubscriptionData> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'stripe_customer_id, stripe_subscription_id, subscription_tier, subscription_period_end'
    )
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return {
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionTier: 'free',
        subscriptionPeriodEnd: null,
      };
    }
    throw new Error(`Failed to get subscription: ${error.message}`);
  }

  return {
    stripeCustomerId: data.stripe_customer_id as string | null,
    stripeSubscriptionId: data.stripe_subscription_id as string | null,
    subscriptionTier: (data.subscription_tier || 'free') as 'free' | 'premium',
    subscriptionPeriodEnd: data.subscription_period_end
      ? new Date(data.subscription_period_end as string)
      : null,
  };
}

/**
 * 透過 Stripe Customer ID 查找用戶 ID
 */
export async function getUserIdByStripeCustomerId(
  stripeCustomerId: string
): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to lookup user by Stripe customer: ${error.message}`);
  }

  return data.id as string;
}

/**
 * 設定用戶的 Stripe Customer ID
 */
export async function setStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('profiles')
    .update({ stripe_customer_id: stripeCustomerId })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to set Stripe customer ID: ${error.message}`);
  }
}

/**
 * 更新用戶的訂閱狀態（由 webhook 呼叫）
 */
export async function updateSubscription(
  userId: string,
  data: {
    subscriptionTier?: 'free' | 'premium';
    stripeSubscriptionId?: string | null;
    subscriptionPeriodEnd?: Date | null;
  }
): Promise<void> {
  const supabase = createAdminClient();

  const updateData: Record<string, unknown> = {};
  if (data.subscriptionTier !== undefined) {
    updateData.subscription_tier = data.subscriptionTier;
  }
  if (data.stripeSubscriptionId !== undefined) {
    updateData.stripe_subscription_id = data.stripeSubscriptionId;
  }
  if (data.subscriptionPeriodEnd !== undefined) {
    updateData.subscription_period_end = data.subscriptionPeriodEnd?.toISOString() ?? null;
  }

  if (Object.keys(updateData).length === 0) return;

  const { error } = await supabase.from('profiles').update(updateData).eq('id', userId);

  if (error) {
    throw new Error(`Failed to update subscription: ${error.message}`);
  }
}
