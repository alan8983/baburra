import { describe, it, expect } from 'vitest';
import { getFeatureAccess } from '../feature-gate.service';

describe('getFeatureAccess (layer-based)', () => {
  describe('layer1', () => {
    it.each(['free', 'pro', 'max'] as const)('grants full access to %s', (tier) => {
      const result = getFeatureAccess('layer1', tier);
      expect(result.gate).toBe('full_access');
      expect(result.layer).toBe('layer1');
    });
  });

  describe('layer2', () => {
    it('returns blur_gate for free users', () => {
      const result = getFeatureAccess('layer2', 'free');
      expect(result.gate).toBe('blur_gate');
      expect(result.requiredTier).toBe('pro');
    });

    it('returns full_access for pro users', () => {
      expect(getFeatureAccess('layer2', 'pro').gate).toBe('full_access');
    });

    it('returns full_access for max users', () => {
      expect(getFeatureAccess('layer2', 'max').gate).toBe('full_access');
    });
  });

  describe('layer3', () => {
    it('returns locked for free users with requiredTier=pro', () => {
      const result = getFeatureAccess('layer3', 'free');
      expect(result.gate).toBe('locked');
      expect(result.requiredTier).toBe('pro');
    });

    it('returns locked for pro users (tier-level — per-stock unlock decides actual visibility)', () => {
      const result = getFeatureAccess('layer3', 'pro');
      expect(result.gate).toBe('locked');
      expect(result.requiredTier).toBe('max');
    });

    it('returns full_access for max users', () => {
      expect(getFeatureAccess('layer3', 'max').gate).toBe('full_access');
    });
  });

  describe('legacy feature name → layer mapping', () => {
    it('argument_cards maps to layer2', () => {
      const result = getFeatureAccess('argument_cards', 'free');
      expect(result.layer).toBe('layer2');
      expect(result.gate).toBe('blur_gate');
    });

    it('win_rate_breakdown maps to layer2', () => {
      expect(getFeatureAccess('win_rate_breakdown', 'free').layer).toBe('layer2');
    });

    it('kol_comparison maps to layer3', () => {
      expect(getFeatureAccess('kol_comparison', 'free').layer).toBe('layer3');
    });

    it('api_access maps to layer3', () => {
      expect(getFeatureAccess('api_access', 'free').layer).toBe('layer3');
    });
  });
});
