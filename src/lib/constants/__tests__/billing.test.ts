import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('billing constants', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getEffectiveCreditLimit', () => {
    it('returns BETA_CREDIT_LIMIT (5000) in beta mode', async () => {
      vi.stubEnv('NEXT_PUBLIC_BILLING_MODE', 'beta');

      const { getEffectiveCreditLimit } = await import('@/domain/models/user');

      expect(getEffectiveCreditLimit('free')).toBe(5000);
      expect(getEffectiveCreditLimit('pro')).toBe(5000);
      expect(getEffectiveCreditLimit('max')).toBe(5000);
    });

    it('returns tier-based limits in production mode', async () => {
      vi.stubEnv('NEXT_PUBLIC_BILLING_MODE', 'production');

      const { getEffectiveCreditLimit } = await import('@/domain/models/user');

      expect(getEffectiveCreditLimit('free')).toBe(700);
      expect(getEffectiveCreditLimit('pro')).toBe(4200);
      expect(getEffectiveCreditLimit('max')).toBe(21000);
    });
  });

  describe('getEffectiveKolLimit', () => {
    it('returns BETA_KOL_TRACKING_LIMIT (50) in beta mode', async () => {
      vi.stubEnv('NEXT_PUBLIC_BILLING_MODE', 'beta');

      const { getEffectiveKolLimit } = await import('@/lib/constants/tiers');

      expect(getEffectiveKolLimit('free')).toBe(50);
      expect(getEffectiveKolLimit('pro')).toBe(50);
      expect(getEffectiveKolLimit('max')).toBe(50);
    });

    it('returns tier-based limits in production mode', async () => {
      vi.stubEnv('NEXT_PUBLIC_BILLING_MODE', 'production');

      const { getEffectiveKolLimit } = await import('@/lib/constants/tiers');

      expect(getEffectiveKolLimit('free')).toBe(5);
      expect(getEffectiveKolLimit('pro')).toBe(30);
      expect(getEffectiveKolLimit('max')).toBe(100);
    });
  });

  describe('isBetaMode', () => {
    it('returns true when BILLING_MODE=beta', async () => {
      vi.stubEnv('NEXT_PUBLIC_BILLING_MODE', 'beta');

      const { isBetaMode } = await import('@/lib/constants/billing');
      expect(isBetaMode()).toBe(true);
    });

    it('returns false when BILLING_MODE=production', async () => {
      vi.stubEnv('NEXT_PUBLIC_BILLING_MODE', 'production');

      const { isBetaMode } = await import('@/lib/constants/billing');
      expect(isBetaMode()).toBe(false);
    });

    it('returns false when BILLING_MODE is unset', async () => {
      vi.stubEnv('NEXT_PUBLIC_BILLING_MODE', '');

      const { isBetaMode } = await import('@/lib/constants/billing');
      expect(isBetaMode()).toBe(false);
    });
  });
});
