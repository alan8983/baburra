import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('getFeatureAccess — beta mode bypass', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns full_access for all features when BILLING_MODE=beta', async () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_MODE', 'beta');

    const { getFeatureAccess } = await import('../feature-gate.service');

    const features = [
      'argument_cards',
      'win_rate_breakdown',
      'kol_comparison',
      'argument_timeline',
      'csv_export',
      'api_access',
      'portfolio_simulation',
    ] as const;

    for (const feature of features) {
      const result = getFeatureAccess(feature, 'free');
      expect(result.gate).toBe('full_access');
    }
  });

  it('returns tier-gated access when BILLING_MODE=production', async () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_MODE', 'production');

    const { getFeatureAccess } = await import('../feature-gate.service');

    const result = getFeatureAccess('argument_cards', 'free');
    expect(result.gate).toBe('blur_gate');
  });

  it('returns tier-gated access when BILLING_MODE is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_MODE', '');

    const { getFeatureAccess } = await import('../feature-gate.service');

    const result = getFeatureAccess('api_access', 'free');
    expect(result.gate).toBe('locked');
  });
});
