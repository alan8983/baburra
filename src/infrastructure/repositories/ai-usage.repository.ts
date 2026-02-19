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
 * 檢查用戶是否還有 AI 配額
 */
export async function checkAiQuota(userId: string): Promise<boolean> {
  const usage = await getAiUsage(userId);
  return usage.remaining > 0;
}

/**
 * 原子性地檢查並消耗一次 AI 配額（使用 DB-level row lock 防止 race condition）。
 * 若 RPC 不存在則 fallback 至應用層邏輯。
 */
export async function consumeAiQuota(userId: string): Promise<AiUsageInfo> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  // Try atomic RPC first
  const { data: rpcRows, error: rpcError } = await supabase.rpc('consume_ai_quota', {
    p_user_id: userId,
  });

  if (!rpcError && rpcRows && (Array.isArray(rpcRows) ? rpcRows.length > 0 : rpcRows)) {
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    const tier = (row.subscription_tier || 'free') as 'free' | 'premium';
    const limit = tier === 'premium' ? PREMIUM_TIER_WEEKLY_LIMIT : FREE_TIER_WEEKLY_LIMIT;
    return {
      usageCount: row.ai_usage_count,
      weeklyLimit: limit,
      remaining: Math.max(0, limit - row.ai_usage_count),
      resetAt: row.ai_usage_reset_at ? new Date(row.ai_usage_reset_at) : null,
      subscriptionTier: tier,
    };
  }

  // If RPC raised AI_QUOTA_EXCEEDED, surface it
  if (rpcError?.message?.includes('AI_QUOTA_EXCEEDED')) {
    const usage = await getAiUsage(userId);
    throw Object.assign(new Error('AI quota exceeded'), { code: 'AI_QUOTA_EXCEEDED', usage });
  }

  // Fallback: RPC doesn't exist yet — use application-layer logic
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('ai_usage_count, ai_usage_reset_at, subscription_tier')
    .eq('id', userId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch profile: ${fetchError.message}`);
  }

  const now = new Date();
  const resetAt = profile.ai_usage_reset_at ? new Date(profile.ai_usage_reset_at) : null;

  let newUsageCount: number;
  let newResetAt: Date;

  if (resetAt && now >= resetAt) {
    newUsageCount = 1;
    newResetAt = new Date(now);
    newResetAt.setDate(newResetAt.getDate() + 7);
    newResetAt.setHours(0, 0, 0, 0);
  } else if (!resetAt) {
    newUsageCount = 1;
    newResetAt = new Date(now);
    newResetAt.setDate(newResetAt.getDate() + 7);
    newResetAt.setHours(0, 0, 0, 0);
  } else {
    newUsageCount = (profile.ai_usage_count || 0) + 1;
    newResetAt = resetAt;
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      ai_usage_count: newUsageCount,
      ai_usage_reset_at: newResetAt.toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    throw new Error(`Failed to update AI usage: ${updateError.message}`);
  }

  const subscriptionTier = (profile.subscription_tier || 'free') as 'free' | 'premium';
  const weeklyLimit =
    subscriptionTier === 'premium' ? PREMIUM_TIER_WEEKLY_LIMIT : FREE_TIER_WEEKLY_LIMIT;

  return {
    usageCount: newUsageCount,
    weeklyLimit,
    remaining: Math.max(0, weeklyLimit - newUsageCount),
    resetAt: newResetAt,
    subscriptionTier,
  };
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
