import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  unlockLayer2,
  unlockLayer3,
  UpgradeRequiredError,
  InsufficientCreditsError,
} from '../unlock.service';
import * as profileRepo from '@/infrastructure/repositories/profile.repository';
import * as unlockRepo from '@/infrastructure/repositories/unlock.repository';
import * as aiUsageRepo from '@/infrastructure/repositories/ai-usage.repository';

vi.mock('@/infrastructure/repositories/profile.repository');
vi.mock('@/infrastructure/repositories/unlock.repository', async () => {
  const actual = await vi.importActual<
    typeof import('@/infrastructure/repositories/unlock.repository')
  >('@/infrastructure/repositories/unlock.repository');
  return {
    ...actual,
    listUnlocks: vi.fn(),
    findUnlock: vi.fn(),
    insertUnlock: vi.fn(),
    countL2UnlocksThisMonth: vi.fn(),
  };
});
vi.mock('@/infrastructure/repositories/ai-usage.repository');

const mockedProfile = vi.mocked(profileRepo);
const mockedUnlock = vi.mocked(unlockRepo);
const mockedAi = vi.mocked(aiUsageRepo);

const USER = 'user-1';
const KOL = 'kol-1';
const STOCK = 'stock-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('unlockLayer2', () => {
  it('Free user within quota: inserts row with credits_paid=0 and returns quotaRemaining', async () => {
    mockedProfile.getUserTier.mockResolvedValue('free');
    mockedUnlock.findUnlock.mockResolvedValue(null);
    mockedUnlock.countL2UnlocksThisMonth.mockResolvedValue(0);
    mockedUnlock.insertUnlock.mockResolvedValue({} as never);

    const result = await unlockLayer2(USER, KOL, STOCK);

    expect(mockedUnlock.insertUnlock).toHaveBeenCalledWith(
      USER,
      'kol_ticker',
      `${KOL}:${STOCK}`,
      0
    );
    expect(result.unlocked).toBe(true);
    expect(result.alreadyUnlocked).toBe(false);
    expect(result.quotaRemaining).toBe(2); // 3 - 0 - 1
  });

  it('Free user over quota: throws UpgradeRequiredError(quota_exhausted)', async () => {
    mockedProfile.getUserTier.mockResolvedValue('free');
    mockedUnlock.findUnlock.mockResolvedValue(null);
    mockedUnlock.countL2UnlocksThisMonth.mockResolvedValue(3);

    await expect(unlockLayer2(USER, KOL, STOCK)).rejects.toBeInstanceOf(UpgradeRequiredError);
    await expect(unlockLayer2(USER, KOL, STOCK)).rejects.toMatchObject({
      reason: 'quota_exhausted',
      requiredTier: 'pro',
    });
    expect(mockedUnlock.insertUnlock).not.toHaveBeenCalled();
  });

  it('Free user re-unlocks same (kolId,stockId): idempotent, no insert, no quota consumption', async () => {
    mockedProfile.getUserTier.mockResolvedValue('free');
    mockedUnlock.findUnlock.mockResolvedValue({
      id: 'u1',
      userId: USER,
      unlockType: 'kol_ticker',
      targetKey: `${KOL}:${STOCK}`,
      creditsPaid: 0,
      unlockedAt: new Date(),
    });
    mockedUnlock.countL2UnlocksThisMonth.mockResolvedValue(1);

    const result = await unlockLayer2(USER, KOL, STOCK);

    expect(result.alreadyUnlocked).toBe(true);
    expect(mockedUnlock.insertUnlock).not.toHaveBeenCalled();
  });

  it('Pro user: no-op success, no row written', async () => {
    mockedProfile.getUserTier.mockResolvedValue('pro');

    const result = await unlockLayer2(USER, KOL, STOCK);

    expect(result.unlocked).toBe(true);
    expect(mockedUnlock.insertUnlock).not.toHaveBeenCalled();
    expect(mockedUnlock.findUnlock).not.toHaveBeenCalled();
  });

  it('Max user: no-op success, no row written', async () => {
    mockedProfile.getUserTier.mockResolvedValue('max');
    const result = await unlockLayer2(USER, KOL, STOCK);
    expect(result.unlocked).toBe(true);
    expect(mockedUnlock.insertUnlock).not.toHaveBeenCalled();
  });
});

describe('unlockLayer3', () => {
  it('Free user: throws UpgradeRequiredError(tier_locked)', async () => {
    mockedProfile.getUserTier.mockResolvedValue('free');
    await expect(unlockLayer3(USER, STOCK)).rejects.toBeInstanceOf(UpgradeRequiredError);
    await expect(unlockLayer3(USER, STOCK)).rejects.toMatchObject({ reason: 'tier_locked' });
    expect(mockedAi.consumeCredits).not.toHaveBeenCalled();
  });

  it('Pro user with credits: deducts 100 credits and inserts unlock', async () => {
    mockedProfile.getUserTier.mockResolvedValue('pro');
    mockedUnlock.findUnlock.mockResolvedValue(null);
    mockedAi.consumeCredits.mockResolvedValue({
      balance: 2900,
      weeklyLimit: 3000,
      resetAt: null,
      subscriptionTier: 'pro',
    });
    mockedUnlock.insertUnlock.mockResolvedValue({} as never);

    const result = await unlockLayer3(USER, STOCK);

    expect(mockedAi.consumeCredits).toHaveBeenCalledWith(USER, 100, 'unlock_layer3');
    expect(mockedUnlock.insertUnlock).toHaveBeenCalledWith(USER, 'stock_page', STOCK, 100);
    expect(result.creditsRemaining).toBe(2900);
  });

  it('Pro user insufficient credits: throws InsufficientCreditsError, no row inserted', async () => {
    mockedProfile.getUserTier.mockResolvedValue('pro');
    mockedUnlock.findUnlock.mockResolvedValue(null);
    mockedAi.consumeCredits.mockRejectedValue(
      Object.assign(new Error('Insufficient credits'), {
        code: 'INSUFFICIENT_CREDITS',
        creditInfo: { balance: 50 },
      })
    );

    await expect(unlockLayer3(USER, STOCK)).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(mockedUnlock.insertUnlock).not.toHaveBeenCalled();
  });

  it('Pro user re-unlocks same stock: idempotent, no credit charge', async () => {
    mockedProfile.getUserTier.mockResolvedValue('pro');
    mockedUnlock.findUnlock.mockResolvedValue({
      id: 'u1',
      userId: USER,
      unlockType: 'stock_page',
      targetKey: STOCK,
      creditsPaid: 100,
      unlockedAt: new Date(),
    });

    const result = await unlockLayer3(USER, STOCK);

    expect(result.alreadyUnlocked).toBe(true);
    expect(mockedAi.consumeCredits).not.toHaveBeenCalled();
    expect(mockedUnlock.insertUnlock).not.toHaveBeenCalled();
  });

  it('Max user: no-op success, no credit charge', async () => {
    mockedProfile.getUserTier.mockResolvedValue('max');
    const result = await unlockLayer3(USER, STOCK);
    expect(result.unlocked).toBe(true);
    expect(mockedAi.consumeCredits).not.toHaveBeenCalled();
    expect(mockedUnlock.insertUnlock).not.toHaveBeenCalled();
  });
});
