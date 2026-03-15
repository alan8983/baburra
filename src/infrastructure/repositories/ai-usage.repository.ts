/**
 * Credit System Repository (formerly AI Usage Quota)
 *
 * Provides credit-based usage tracking with variable costs per operation.
 * Tiers: free (850/wk), pro (4200/wk), max (21000/wk)
 */

import { createAdminClient } from '@/infrastructure/supabase/admin';
import { CREDIT_LIMITS } from '@/domain/models/user';
import type { SubscriptionTier } from '@/domain/models/user';

// ── Credit Info (new interface) ──

export interface CreditInfo {
  balance: number;
  weeklyLimit: number;
  resetAt: Date | null;
  subscriptionTier: SubscriptionTier;
}

// ── Backward-compatible alias ──

export interface AiUsageInfo {
  usageCount: number;
  weeklyLimit: number;
  remaining: number;
  resetAt: Date | null;
  subscriptionTier: SubscriptionTier;
}

function creditInfoToAiUsageInfo(info: CreditInfo): AiUsageInfo {
  return {
    usageCount: info.weeklyLimit - info.balance,
    weeklyLimit: info.weeklyLimit,
    remaining: info.balance,
    resetAt: info.resetAt,
    subscriptionTier: info.subscriptionTier,
  };
}

// ── Core Functions ──

/**
 * Get current credit balance and tier info.
 */
export async function getCreditInfo(userId: string): Promise<CreditInfo> {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      balance: CREDIT_LIMITS.free,
      weeklyLimit: CREDIT_LIMITS.free,
      resetAt: null,
      subscriptionTier: 'free',
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('credit_balance, credit_reset_at, subscription_tier')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return {
        balance: CREDIT_LIMITS.free,
        weeklyLimit: CREDIT_LIMITS.free,
        resetAt: null,
        subscriptionTier: 'free',
      };
    }
    throw new Error(`Failed to get credit info: ${error.message}`);
  }

  const tier = (data.subscription_tier || 'free') as SubscriptionTier;
  const weeklyLimit = CREDIT_LIMITS[tier] ?? CREDIT_LIMITS.free;
  let balance = data.credit_balance ?? weeklyLimit;

  // If past reset time, balance should be full
  const resetAt = data.credit_reset_at ? new Date(data.credit_reset_at) : null;
  if (resetAt && new Date() >= resetAt) {
    balance = weeklyLimit;
  }

  return {
    balance,
    weeklyLimit,
    resetAt,
    subscriptionTier: tier,
  };
}

/**
 * Atomically consume credits for an operation.
 * Uses DB-level row lock to prevent race conditions.
 */
export async function consumeCredits(
  userId: string,
  amount: number,
  operation: string = 'unknown'
): Promise<CreditInfo> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  const { data, error: rpcError } = await supabase.rpc('consume_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_operation: operation,
  });

  if (rpcError?.message?.includes('INSUFFICIENT_CREDITS')) {
    const info = await getCreditInfo(userId);
    throw Object.assign(new Error('Insufficient credits'), {
      code: 'INSUFFICIENT_CREDITS',
      usage: creditInfoToAiUsageInfo(info),
      creditInfo: info,
    });
  }

  if (rpcError) {
    throw new Error(
      `consume_credits RPC failed: ${rpcError.message}. ` +
        'Ensure migration 029_credit_system.sql has been applied.'
    );
  }

  const parsed = typeof data === 'object' && data !== null ? data : null;
  if (!parsed) {
    throw new Error('consume_credits RPC returned no data');
  }

  const tier = (parsed.subscription_tier || 'free') as SubscriptionTier;
  return {
    balance: parsed.credit_balance,
    weeklyLimit: parsed.weekly_limit ?? CREDIT_LIMITS[tier] ?? CREDIT_LIMITS.free,
    resetAt: parsed.credit_reset_at ? new Date(parsed.credit_reset_at) : null,
    subscriptionTier: tier,
  };
}

/**
 * Refund credits (e.g., when an operation fails after credits were consumed).
 */
export async function refundCredits(userId: string, amount: number): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  const { error } = await supabase.rpc('refund_credits', {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    throw new Error(`refund_credits RPC failed: ${error.message}`);
  }
}

/**
 * Reset user credits to full (admin function).
 */
export async function resetCredits(userId: string): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single();

  const tier = (profile?.subscription_tier || 'free') as SubscriptionTier;
  const weeklyLimit = CREDIT_LIMITS[tier] ?? CREDIT_LIMITS.free;

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(0, 0, 0, 0);

  const { error } = await supabase
    .from('profiles')
    .update({
      credit_balance: weeklyLimit,
      credit_reset_at: nextWeek.toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to reset credits: ${error.message}`);
  }
}

// ── Backward-compatible aliases ──
// These wrap the new credit functions to match the old API shape.
// Existing callers (API routes, import pipeline) can continue using these.

export async function getAiUsage(userId: string): Promise<AiUsageInfo> {
  const info = await getCreditInfo(userId);
  return creditInfoToAiUsageInfo(info);
}

/**
 * Consume 1 credit (backward-compatible with old flat quota system).
 * For variable-cost operations, use consumeCredits() directly.
 */
export async function consumeAiQuota(userId: string): Promise<AiUsageInfo> {
  const info = await consumeCredits(userId, 1, 'legacy_single');
  return creditInfoToAiUsageInfo(info);
}

export async function refundAiQuota(userId: string): Promise<void> {
  return refundCredits(userId, 1);
}

export async function resetAiQuota(userId: string): Promise<void> {
  return resetCredits(userId);
}
