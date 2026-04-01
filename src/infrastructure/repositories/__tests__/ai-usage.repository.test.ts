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

import { consumeAiQuota, getAiUsage, reconcileTranscriptionCredits } from '../ai-usage.repository';

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
          credit_balance: 697,
          credit_reset_at: resetAt,
          subscription_tier: 'free',
          weekly_limit: 700,
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
        weeklyLimit: 700,
        remaining: 697,
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
          credit_balance: 699,
          credit_reset_at: '2025-02-01T00:00:00Z',
          subscription_tier: 'free',
          weekly_limit: 700,
        },
        error: null,
      });

      const result = await consumeAiQuota(USER_ID);

      expect(result.usageCount).toBe(1);
      expect(result.remaining).toBe(699);
    });

    it('should handle null resetAt in RPC response', async () => {
      mockRpc.mockResolvedValue({
        data: {
          credit_balance: 699,
          credit_reset_at: null,
          subscription_tier: 'free',
          weekly_limit: 700,
        },
        error: null,
      });

      const result = await consumeAiQuota(USER_ID);

      expect(result.resetAt).toBeNull();
    });
  });

  describe('reconcileTranscriptionCredits', () => {
    it('skips reconciliation when difference is within 20% threshold', async () => {
      const result = await reconcileTranscriptionCredits('user-1', 60, 55, 5);

      expect(result).toBe(0);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('refunds credits when actual is significantly shorter than estimated', async () => {
      // Estimated 60min, actual 42min → delta = (42 - 60) × 5 = -90
      mockRpc.mockResolvedValue({
        data: { credit_balance: 790, refunded: 90 },
        error: null,
      });

      const result = await reconcileTranscriptionCredits('user-1', 60, 42, 5);

      expect(result).toBe(-90);
      expect(mockRpc).toHaveBeenCalledWith('refund_credits', {
        p_user_id: 'user-1',
        p_amount: 90,
      });
    });

    it('charges additional credits when actual is significantly longer than estimated', async () => {
      // Estimated 10min, actual 45min → delta = (45 - 10) × 5 = 175
      mockRpc.mockResolvedValue({
        data: {
          credit_balance: 525,
          credit_reset_at: null,
          subscription_tier: 'free',
          weekly_limit: 700,
          consumed: 175,
          operation: 'transcription_reconciliation',
        },
        error: null,
      });

      const result = await reconcileTranscriptionCredits('user-1', 10, 45, 5);

      expect(result).toBe(175);
      expect(mockRpc).toHaveBeenCalledWith('consume_credits', {
        p_user_id: 'user-1',
        p_amount: 175,
        p_operation: 'transcription_reconciliation',
      });
    });

    it('does not throw when additional charge fails (insufficient balance)', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'INSUFFICIENT_CREDITS' },
      });

      // Mock getCreditInfo follow-up for consumeCredits error handling
      setupProfileMock({
        credit_balance: 0,
        credit_reset_at: '2025-02-01T00:00:00Z',
        subscription_tier: 'free',
      });

      // Should not throw — reconciliation failure is non-blocking
      const result = await reconcileTranscriptionCredits('user-1', 10, 45, 5);

      expect(result).toBe(175);
    });
  });

  describe('getAiUsage', () => {
    it('should return usage info from profile', async () => {
      const futureReset = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      setupProfileMock({
        credit_balance: 695,
        credit_reset_at: futureReset,
        subscription_tier: 'free',
      });

      const result = await getAiUsage(USER_ID);

      expect(result.usageCount).toBe(5);
      expect(result.remaining).toBe(695);
      expect(result.weeklyLimit).toBe(700);
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
      expect(result.remaining).toBe(700);
    });

    it('should return defaults for missing user (PGRST116)', async () => {
      setupProfileMock(null, { code: 'PGRST116', message: 'not found' });

      const result = await getAiUsage(USER_ID);

      expect(result.usageCount).toBe(0);
      expect(result.weeklyLimit).toBe(700);
      expect(result.remaining).toBe(700);
      expect(result.subscriptionTier).toBe('free');
    });
  });
});
