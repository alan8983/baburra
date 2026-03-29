import { describe, it, expect } from 'vitest';
import { getFeatureAccess, type Feature } from '../feature-gate.service';

describe('getFeatureAccess', () => {
  describe('blur gate features', () => {
    it('returns blur_gate with previewLimit 2 for free user on argument_cards', () => {
      const result = getFeatureAccess('argument_cards', 'free');
      expect(result).toEqual({ gate: 'blur_gate', previewLimit: 2, requiredTier: 'pro' });
    });

    it('returns blur_gate with previewLimit 1 for free user on win_rate_breakdown', () => {
      const result = getFeatureAccess('win_rate_breakdown', 'free');
      expect(result).toEqual({ gate: 'blur_gate', previewLimit: 1, requiredTier: 'pro' });
    });

    it('returns full_access for pro user on argument_cards', () => {
      const result = getFeatureAccess('argument_cards', 'pro');
      expect(result).toEqual({ gate: 'full_access', requiredTier: 'pro' });
    });
  });

  describe('pro badge features', () => {
    const proBadgeFeatures: Feature[] = ['kol_comparison', 'argument_timeline', 'csv_export'];

    proBadgeFeatures.forEach((feature) => {
      it(`returns pro_badge for free user on ${feature}`, () => {
        const result = getFeatureAccess(feature, 'free');
        expect(result).toEqual({ gate: 'pro_badge', requiredTier: 'pro' });
      });

      it(`returns full_access for pro user on ${feature}`, () => {
        const result = getFeatureAccess(feature, 'pro');
        expect(result).toEqual({ gate: 'full_access', requiredTier: 'pro' });
      });
    });
  });

  describe('max-only features', () => {
    const maxFeatures: Feature[] = ['api_access', 'portfolio_simulation'];

    maxFeatures.forEach((feature) => {
      it(`returns locked for free user on ${feature}`, () => {
        const result = getFeatureAccess(feature, 'free');
        expect(result).toEqual({ gate: 'locked', requiredTier: 'max' });
      });

      it(`returns locked for pro user on ${feature}`, () => {
        const result = getFeatureAccess(feature, 'pro');
        expect(result).toEqual({ gate: 'locked', requiredTier: 'max' });
      });

      it(`returns full_access for max user on ${feature}`, () => {
        const result = getFeatureAccess(feature, 'max');
        expect(result).toEqual({ gate: 'full_access', requiredTier: 'max' });
      });
    });
  });

  describe('max tier gets full access to everything', () => {
    const allFeatures: Feature[] = [
      'argument_cards',
      'win_rate_breakdown',
      'kol_comparison',
      'argument_timeline',
      'csv_export',
      'api_access',
      'portfolio_simulation',
    ];

    allFeatures.forEach((feature) => {
      it(`returns full_access for max user on ${feature}`, () => {
        const result = getFeatureAccess(feature, 'max');
        expect(result.gate).toBe('full_access');
      });
    });
  });
});
