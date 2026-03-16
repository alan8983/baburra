/**
 * AI Usage Repository Tests
 * Verifies credit consumption, balance queries, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase admin client
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

import { consumeAiQuota, getAiUsage } from '../ai-usage.repository';

const USER_ID = '00000000-0000-0000-0000-000000000001';

function setupProfileMock(profileData: Record<string, unknown> | null, error?: unknown) {
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: profileData, error: error ?? null }),
      }),
    }),
  }));
}

describe('ai-usage.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('consumeAiQuota', () => {
    it('should return AiUsageInfo on successful RPC call', async () => {
      const resetAt = '2025-02-01T00:00:00Z';
      mockRpc.mockResolvedValue({
        data: {
          credit_balance: 847,
          credit_reset_at: resetAt,
          subscription_tier: 'free',
          weekly_limit: 850,
        },
        error: null,
      });

      const result = await consumeAiQuota(USER_ID);

      expect(mockRpc).toHaveBeenCalledWith('consume_credits', {
        p_user_id: USER_ID,
        p_amount: 1,
        p_operation: 'legacy_single',
      });
      expect(result).toEqual({
        usageCount: 3,
        weeklyLimit: 850,
        remaining: 847,
        resetAt: new Date(resetAt),
        subscriptionTier: 'free',
      });
    });

    it('should handle premium tier with correct weekly limit', async () => {
      mockRpc.mockResolvedValue({
        data: {
          credit_balance: 2100,
          credit_reset_at: '2025-02-01T00:00:00Z',
          subscription_tier: 'pro',
          weekly_limit: 4200,
        },
        error: null,
      });

      const result = await consumeAiQuota(USER_ID);

      expect(result.weeklyLimit).toBe(4200);
      expect(result.remaining).toBe(2100);
      expect(result.subscriptionTier).toBe('pro');
    });

    it('should throw INSUFFICIENT_CREDITS with structured error', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'INSUFFICIENT_CREDITS' },
      });

      // Mock getCreditInfo follow-up read
      setupProfileMock({
        credit_balance: 0,
        credit_reset_at: '2025-02-01T00:00:00Z',
        subscription_tier: 'free',
      });

      try {
        await consumeAiQuota(USER_ID);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as { code: string }).code).toBe('INSUFFICIENT_CREDITS');
        expect((err as { usage: unknown }).usage).toBeDefined();
      }
    });

    it('should throw descriptive error when RPC function is missing (no fallback)', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'function consume_credits(uuid) does not exist' },
      });

      await expect(consumeAiQuota(USER_ID)).rejects.toThrow('029_credit_system.sql');
    });

    it('should throw when RPC returns empty data', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: null,
      });

      await expect(consumeAiQuota(USER_ID)).rejects.toThrow('returned no data');
    });

    it('should handle object RPC response', async () => {
      mockRpc.mockResolvedValue({
        data: {
          credit_balance: 849,
          credit_reset_at: '2025-02-01T00:00:00Z',
          subscription_tier: 'free',
          weekly_limit: 850,
        },
        error: null,
      });

      const result = await consumeAiQuota(USER_ID);

      expect(result.usageCount).toBe(1);
      expect(result.remaining).toBe(849);
    });

    it('should handle null resetAt in RPC response', async () => {
      mockRpc.mockResolvedValue({
        data: {
          credit_balance: 849,
          credit_reset_at: null,
          subscription_tier: 'free',
          weekly_limit: 850,
        },
        error: null,
      });

      const result = await consumeAiQuota(USER_ID);

      expect(result.resetAt).toBeNull();
    });
  });

  describe('getAiUsage', () => {
    it('should return usage info from profile', async () => {
      const futureReset = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      setupProfileMock({
        credit_balance: 845,
        credit_reset_at: futureReset,
        subscription_tier: 'free',
      });

      const result = await getAiUsage(USER_ID);

      expect(result.usageCount).toBe(5);
      expect(result.remaining).toBe(845);
      expect(result.weeklyLimit).toBe(850);
    });

    it('should reset effective usage count when past reset date', async () => {
      const pastReset = new Date(Date.now() - 1000).toISOString();
      setupProfileMock({
        credit_balance: 10,
        credit_reset_at: pastReset,
        subscription_tier: 'free',
      });

      const result = await getAiUsage(USER_ID);

      expect(result.usageCount).toBe(0);
      expect(result.remaining).toBe(850);
    });

    it('should return defaults for missing user (PGRST116)', async () => {
      setupProfileMock(null, { code: 'PGRST116', message: 'not found' });

      const result = await getAiUsage(USER_ID);

      expect(result.usageCount).toBe(0);
      expect(result.weeklyLimit).toBe(850);
      expect(result.remaining).toBe(850);
      expect(result.subscriptionTier).toBe('free');
    });
  });
});
