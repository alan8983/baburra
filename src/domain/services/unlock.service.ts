/**
 * Unlock Service — tier-aware L2/L3 content unlock decisions.
 *
 * Rules (per openspec/changes/tier-layer-unlocks/specs/tier-unlocks/spec.md):
 *
 *   Layer 2 (kol_ticker):
 *     - Free: quota of TIER_LIMITS.free.freeL2UnlocksPerMonth per calendar month; persistent per (kolId, stockId)
 *     - Pro/Max: unlimited, no unlock row written
 *
 *   Layer 3 (stock_page):
 *     - Free: locked (UpgradeRequiredError: tier_locked)
 *     - Pro: pay UNLOCK_COSTS.layer3_stock_page credits, persistent per stockId
 *     - Max: unlimited, no unlock row written
 */

import { TIER_LIMITS } from '@/lib/constants/tiers';
import { UNLOCK_COSTS } from '@/domain/models/user';
import { getUserTier } from '@/infrastructure/repositories/profile.repository';
import { consumeCredits } from '@/infrastructure/repositories/ai-usage.repository';
import {
  countL2UnlocksThisMonth,
  findUnlock,
  insertUnlock,
  kolTickerKey,
  listUnlocks,
  stockPageKey,
  type ContentUnlock,
} from '@/infrastructure/repositories/unlock.repository';
import type { SubscriptionTier } from '@/domain/models/user';

// ── Errors ──────────────────────────────────────────────────────────────

export type UpgradeRequiredReason = 'quota_exhausted' | 'tier_locked';

export class UpgradeRequiredError extends Error {
  readonly code = 'UPGRADE_REQUIRED';
  constructor(
    public readonly reason: UpgradeRequiredReason,
    public readonly requiredTier: 'pro' | 'max'
  ) {
    super(`Upgrade required: ${reason}`);
  }
}

export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS';
  constructor(
    public readonly required: number,
    public readonly available: number
  ) {
    super(`Insufficient credits: need ${required}, have ${available}`);
  }
}

// ── Result shapes ───────────────────────────────────────────────────────

export interface UnlockResult {
  unlocked: true;
  creditsRemaining?: number;
  quotaRemaining?: number;
  alreadyUnlocked: boolean;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function listUserUnlocks(userId: string): Promise<ContentUnlock[]> {
  return listUnlocks(userId);
}

export async function hasUnlockedLayer2(
  userId: string,
  kolId: string,
  stockId: string,
  tier?: SubscriptionTier
): Promise<boolean> {
  const resolvedTier = tier ?? (await getUserTier(userId));
  if (resolvedTier === 'pro' || resolvedTier === 'max') return true;
  const unlock = await findUnlock(userId, 'kol_ticker', kolTickerKey(kolId, stockId));
  return unlock !== null;
}

export async function hasUnlockedLayer3(
  userId: string,
  stockId: string,
  tier?: SubscriptionTier
): Promise<boolean> {
  const resolvedTier = tier ?? (await getUserTier(userId));
  if (resolvedTier === 'max') return true;
  if (resolvedTier === 'free') return false;
  const unlock = await findUnlock(userId, 'stock_page', stockPageKey(stockId));
  return unlock !== null;
}

export async function getFreeL2UnlocksUsedThisMonth(userId: string): Promise<number> {
  return countL2UnlocksThisMonth(userId);
}

export async function unlockLayer2(
  userId: string,
  kolId: string,
  stockId: string
): Promise<UnlockResult> {
  const tier = await getUserTier(userId);

  // Pro/Max: unlimited, no row written
  if (tier === 'pro' || tier === 'max') {
    return { unlocked: true, alreadyUnlocked: false };
  }

  // Free: check idempotency first
  const key = kolTickerKey(kolId, stockId);
  const existing = await findUnlock(userId, 'kol_ticker', key);
  if (existing) {
    const used = await countL2UnlocksThisMonth(userId);
    const limit = TIER_LIMITS.free.freeL2UnlocksPerMonth;
    return {
      unlocked: true,
      alreadyUnlocked: true,
      quotaRemaining: Math.max(0, limit - used),
    };
  }

  // Free: check monthly quota
  const used = await countL2UnlocksThisMonth(userId);
  const limit = TIER_LIMITS.free.freeL2UnlocksPerMonth;
  if (used >= limit) {
    throw new UpgradeRequiredError('quota_exhausted', 'pro');
  }

  // Insert free unlock
  await insertUnlock(userId, 'kol_ticker', key, 0);
  return {
    unlocked: true,
    alreadyUnlocked: false,
    quotaRemaining: Math.max(0, limit - used - 1),
  };
}

export async function unlockLayer3(userId: string, stockId: string): Promise<UnlockResult> {
  const tier = await getUserTier(userId);

  // Max: unlimited, no row written
  if (tier === 'max') {
    return { unlocked: true, alreadyUnlocked: false };
  }

  // Free: hard locked
  if (tier === 'free') {
    throw new UpgradeRequiredError('tier_locked', 'pro');
  }

  // Pro: check idempotency first
  const key = stockPageKey(stockId);
  const existing = await findUnlock(userId, 'stock_page', key);
  if (existing) {
    return { unlocked: true, alreadyUnlocked: true };
  }

  // Pro: consume credits then insert
  const cost = UNLOCK_COSTS.layer3_stock_page;
  let creditsRemaining: number;
  try {
    const info = await consumeCredits(userId, cost, 'unlock_layer3');
    creditsRemaining = info.balance;
  } catch (err) {
    const maybe = err as { code?: string; creditInfo?: { balance: number } };
    if (maybe?.code === 'INSUFFICIENT_CREDITS') {
      throw new InsufficientCreditsError(cost, maybe.creditInfo?.balance ?? 0);
    }
    throw err;
  }

  await insertUnlock(userId, 'stock_page', key, cost);
  return { unlocked: true, alreadyUnlocked: false, creditsRemaining };
}
