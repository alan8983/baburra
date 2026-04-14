/**
 * Verifies the scorecard invalidation contract from the
 * `persist-kol-scorecard-cache` kol-scorecard spec:
 *
 *   1. A post event invalidates its KOL row and every referenced Stock row.
 *   2. Cross-KOL isolation — a post by KOL B that mentions Stock X does NOT
 *      touch KOL A's scorecard, even when A has posts about X.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const kolUpdates: Array<{ stale: unknown; ids: unknown[] }> = [];
const stockUpdates: Array<{ stale: unknown; ids: unknown[] }> = [];

function makeChain(table: 'kol_scorecard_cache' | 'stock_scorecard_cache') {
  let currentUpdate: { stale: unknown } | null = null;
  const chain = {
    update: vi.fn((payload: { stale: unknown }) => {
      currentUpdate = payload;
      return chain;
    }),
    in: vi.fn((_col: string, ids: unknown[]) => {
      if (currentUpdate) {
        if (table === 'kol_scorecard_cache') {
          kolUpdates.push({ stale: currentUpdate.stale, ids });
        } else {
          stockUpdates.push({ stale: currentUpdate.stale, ids });
        }
      }
      return Promise.resolve({ error: null });
    }),
  };
  return chain;
}

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (name: string) => {
      if (name === 'kol_scorecard_cache') return makeChain('kol_scorecard_cache');
      if (name === 'stock_scorecard_cache') return makeChain('stock_scorecard_cache');
      throw new Error(`Unexpected table: ${name}`);
    },
  }),
}));

import {
  invalidateScorecardsForPost,
  markKolScorecardStale,
  markStockScorecardStale,
} from '../scorecard-cache.repository';

beforeEach(() => {
  kolUpdates.length = 0;
  stockUpdates.length = 0;
});

describe('invalidateScorecardsForPost', () => {
  it('marks the KOL row and every referenced Stock row stale', async () => {
    await invalidateScorecardsForPost({
      kolId: 'kol-A',
      stockIds: ['stock-X', 'stock-Y'],
    });

    expect(kolUpdates).toEqual([{ stale: true, ids: ['kol-A'] }]);
    expect(stockUpdates).toEqual([{ stale: true, ids: ['stock-X', 'stock-Y'] }]);
  });

  it('cross-KOL isolation: B invalidating only touches B and the stocks B mentioned', async () => {
    await invalidateScorecardsForPost({
      kolId: 'kol-B',
      stockIds: ['stock-X'],
    });

    // Only kol-B — kol-A never appears in any update.
    const allKolIds = kolUpdates.flatMap((u) => u.ids);
    expect(allKolIds).toEqual(['kol-B']);
    expect(allKolIds).not.toContain('kol-A');

    // Stock X is invalidated because it's in this post.
    const allStockIds = stockUpdates.flatMap((u) => u.ids);
    expect(allStockIds).toEqual(['stock-X']);
  });

  it('no-op when stockIds is empty — KOL still invalidated, stock update skipped', async () => {
    await invalidateScorecardsForPost({ kolId: 'kol-A', stockIds: [] });

    expect(kolUpdates).toEqual([{ stale: true, ids: ['kol-A'] }]);
    // markStockScorecardStale short-circuits on empty input.
    expect(stockUpdates).toEqual([]);
  });
});

describe('markKolScorecardStale / markStockScorecardStale', () => {
  it('markKolScorecardStale short-circuits on empty input', async () => {
    await markKolScorecardStale([]);
    expect(kolUpdates).toEqual([]);
  });

  it('markStockScorecardStale short-circuits on empty input', async () => {
    await markStockScorecardStale([]);
    expect(stockUpdates).toEqual([]);
  });
});
