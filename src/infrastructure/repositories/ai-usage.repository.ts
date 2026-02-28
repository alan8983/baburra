/**
 * AI 使用配額 Repository
 */

import { createAdminClient } from '@/infrastructure/supabase/admin';

// 配額設定
const FREE_TIER_WEEKLY_LIMIT = 15;
const PREMIUM_TIER_WEEKLY_LIMIT = 100;

export interface AiUsageInfo {
  usageCount: number;
  weeklyLimit: number;
  remaining: number;
  resetAt: Date | null;
  subscriptionTier: 'free' | 'premium';
}

/**
 * 取得用戶的 AI 使用配額資訊
 */
export async function getAiUsage(userId: string): Promise<AiUsageInfo> {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      usageCount: 0,
      weeklyLimit: FREE_TIER_WEEKLY_LIMIT,
      remaining: FREE_TIER_WEEKLY_LIMIT,
      resetAt: null,
      subscriptionTier: 'free',
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('ai_usage_count, ai_usage_reset_at, subscription_tier')
    .eq('id', userId)
    .single();

  if (error) {
    // 如果用戶不存在，返回預設值
    if (error.code === 'PGRST116') {
      return {
        usageCount: 0,
        weeklyLimit: FREE_TIER_WEEKLY_LIMIT,
        remaining: FREE_TIER_WEEKLY_LIMIT,
        resetAt: null,
        subscriptionTier: 'free',
      };
    }
    throw new Error(`Failed to get AI usage: ${error.message}`);
  }

  const subscriptionTier = (data.subscription_tier || 'free') as 'free' | 'premium';
  const weeklyLimit =
    subscriptionTier === 'premium' ? PREMIUM_TIER_WEEKLY_LIMIT : FREE_TIER_WEEKLY_LIMIT;
  const usageCount = data.ai_usage_count || 0;

  // 檢查是否需要重置配額
  const resetAt = data.ai_usage_reset_at ? new Date(data.ai_usage_reset_at) : null;
  const now = new Date();

  // 如果已過重置時間，配額應該已重置
  const effectiveUsageCount = resetAt && now >= resetAt ? 0 : usageCount;

  return {
    usageCount: effectiveUsageCount,
    weeklyLimit,
    remaining: Math.max(0, weeklyLimit - effectiveUsageCount),
    resetAt,
    subscriptionTier,
  };
}

/**
 * 原子性地檢查並消耗一次 AI 配額（使用 DB-level row lock 防止 race condition）。
 * 依賴 PostgreSQL RPC `consume_ai_quota`（migration 007）。
 */
export async function consumeAiQuota(userId: string): Promise<AiUsageInfo> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  // Atomic RPC: SELECT ... FOR UPDATE + check + increment in a single transaction
  // Function returns JSONB to avoid PostgREST "cannot get array length of a scalar" issue
  const { data, error: rpcError } = await supabase.rpc('consume_ai_quota', {
    p_user_id: userId,
  });

  // If RPC raised AI_QUOTA_EXCEEDED, surface it with structured error
  if (rpcError?.message?.includes('AI_QUOTA_EXCEEDED')) {
    const usage = await getAiUsage(userId);
    throw Object.assign(new Error('AI quota exceeded'), { code: 'AI_QUOTA_EXCEEDED', usage });
  }

  // Any other RPC error (function missing, connection issue, etc.) is a hard failure
  if (rpcError) {
    throw new Error(
      `consume_ai_quota RPC failed: ${rpcError.message}. ` +
        'Ensure migration 007_atomic_ai_quota.sql has been applied.'
    );
  }

  // Parse result — supports both JSONB (scalar) and TABLE (array) return types
  const row = typeof data === 'object' && data !== null && !Array.isArray(data) ? data : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: Record<string, any> = row ?? (Array.isArray(data) ? data[0] : null);
  if (!parsed) {
    throw new Error('consume_ai_quota RPC returned no data');
  }

  const tier = (parsed.subscription_tier || 'free') as 'free' | 'premium';
  const limit = tier === 'premium' ? PREMIUM_TIER_WEEKLY_LIMIT : FREE_TIER_WEEKLY_LIMIT;
  return {
    usageCount: parsed.ai_usage_count,
    weeklyLimit: limit,
    remaining: Math.max(0, limit - parsed.ai_usage_count),
    resetAt: parsed.ai_usage_reset_at ? new Date(parsed.ai_usage_reset_at) : null,
    subscriptionTier: tier,
  };
}

/**
 * Refund a single AI quota usage (e.g., when post creation fails after quota was consumed).
 * Uses a DB-level RPC with row lock to prevent race conditions.
 */
export async function refundAiQuota(userId: string): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  const { error } = await supabase.rpc('refund_ai_quota', {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`refund_ai_quota RPC failed: ${error.message}`);
  }
}

/**
 * 重置用戶的 AI 配額（管理員功能）
 */
export async function resetAiQuota(userId: string): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(0, 0, 0, 0);

  const { error } = await supabase
    .from('profiles')
    .update({
      ai_usage_count: 0,
      ai_usage_reset_at: nextWeek.toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to reset AI quota: ${error.message}`);
  }
}
