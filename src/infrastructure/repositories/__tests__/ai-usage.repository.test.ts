/**
 * AI Usage Repository Tests
 * Verifies atomic quota consumption and error handling.
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
        data: [{ ai_usage_count: 3, ai_usage_reset_at: resetAt, subscription_tier: 'free' }],
        error: null,
      });

      const result = await consumeAiQuota(USER_ID);

      expect(mockRpc).toHaveBeenCalledWith('consume_ai_quota', { p_user_id: USER_ID });
      expect(result).toEqual({
        usageCount: 3,
        weeklyLimit: 15,
        remaining: 12,
        resetAt: new Date(resetAt),
        subscriptionTier: 'free',
      });
    });

    it('should handle premium tier with correct weekly limit', async () => {
      mockRpc.mockResolvedValue({
        data: [
          {
            ai_usage_count: 50,
            ai_usage_reset_at: '2025-02-01T00:00:00Z',
            subscription_tier: 'premium',
          },
        ],
        error: null,
      });

      const result = await consumeAiQuota(USER_ID);

      expect(result.weeklyLimit).toBe(100);
      expect(result.remaining).toBe(50);
      expect(result.subscriptionTier).toBe('premium');
    });

    it('should throw AI_QUOTA_EXCEEDED with structured error', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'AI_QUOTA_EXCEEDED' },
      });

      // Mock getAiUsage follow-up read
      setupProfileMock({
        ai_usage_count: 15,
        ai_usage_reset_at: '2025-02-01T00:00:00Z',
        subscription_tier: 'free',
      });

      try {
        await consumeAiQuota(USER_ID);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as { code: string }).code).toBe('AI_QUOTA_EXCEEDED');
        expect((err as { usage: unknown }).usage).toBeDefined();
      }
    });

    it('should throw descriptive error when RPC function is missing (no fallback)', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'function consume_ai_quota(uuid) does not exist' },
      });

      await expect(consumeAiQuota(USER_ID)).rejects.toThrow('007_atomic_ai_quota.sql');
    });

    it('should throw when RPC returns empty data', async () => {
      mockRpc.mockResolvedValue({
        data: [],
        error: null,
      });

      await expect(consumeAiQuota(USER_ID)).rejects.toThrow('returned no data');
    });

    it('should handle non-array RPC response', async () => {
      mockRpc.mockResolvedValue({
        data: {
          ai_usage_count: 1,
          ai_usage_reset_at: '2025-02-01T00:00:00Z',
          subscription_tier: 'free',
        },
        error: null,
      });

      const result = await consumeAiQuota(USER_ID);

      expect(result.usageCount).toBe(1);
      expect(result.remaining).toBe(14);
    });

    it('should handle null resetAt in RPC response', async () => {
      mockRpc.mockResolvedValue({
        data: [{ ai_usage_count: 1, ai_usage_reset_at: null, subscription_tier: 'free' }],
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
        ai_usage_count: 5,
        ai_usage_reset_at: futureReset,
        subscription_tier: 'free',
      });

      const result = await getAiUsage(USER_ID);

      expect(result.usageCount).toBe(5);
      expect(result.remaining).toBe(10);
      expect(result.weeklyLimit).toBe(15);
    });

    it('should reset effective usage count when past reset date', async () => {
      const pastReset = new Date(Date.now() - 1000).toISOString();
      setupProfileMock({
        ai_usage_count: 10,
        ai_usage_reset_at: pastReset,
        subscription_tier: 'free',
      });

      const result = await getAiUsage(USER_ID);

      expect(result.usageCount).toBe(0);
      expect(result.remaining).toBe(15);
    });

    it('should return defaults for missing user (PGRST116)', async () => {
      setupProfileMock(null, { code: 'PGRST116', message: 'not found' });

      const result = await getAiUsage(USER_ID);

      expect(result.usageCount).toBe(0);
      expect(result.weeklyLimit).toBe(15);
      expect(result.remaining).toBe(15);
      expect(result.subscriptionTier).toBe('free');
    });
  });
});
