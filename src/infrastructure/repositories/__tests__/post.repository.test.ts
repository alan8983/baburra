/**
 * Regression tests for post.repository wiring. Pins the input-field →
 * RPC-parameter contract that issue #89 (D2) broke when `source` was silently
 * dropped between `CreatePostInput` and `create_post_atomic`. Any future
 * change that omits a `Create*Input` field from the RPC call should fail here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CreatePostInput } from '@/domain/models';

vi.mock('../win-rate-sample.repository', () => ({
  invalidateByPost: vi.fn().mockResolvedValue(undefined),
  loadSamplesByPostIds: vi.fn(),
  loadSamplesByPostId: vi.fn(),
  upsertSamples: vi.fn(),
  invalidateByPostStock: vi.fn(),
  clearByTicker: vi.fn(),
  sampleKey: (p: string, s: string, d: number) => `${p}:${s}:${d}`,
}));

vi.mock('../scorecard-cache.repository', () => ({
  invalidateScorecardsForPost: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/domain/services/scorecard.service', () => ({
  enqueueKolScorecardCompute: vi.fn(),
  enqueueStockScorecardCompute: vi.fn(),
}));

const rpcMock = vi.fn();

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({
    from: vi.fn(),
    rpc: (name: string, params: Record<string, unknown>) => rpcMock(name, params),
  }),
}));

import { createPost } from '../post.repository';

const rpcRow = {
  id: 'post-1',
  kol_id: 'kol-1',
  title: null,
  content: 'c',
  source_url: 'https://example.com/p',
  source_platform: 'manual',
  images: [],
  sentiment: 0,
  sentiment_ai_generated: false,
  ai_model_version: null,
  posted_at: '2024-01-01T00:00:00.000Z',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  created_by: 'user-1',
  primary_post_id: null,
  content_fingerprint: null,
};

function baseInput(overrides: Partial<CreatePostInput> = {}): CreatePostInput {
  return {
    kolId: 'kol-1',
    stockIds: [],
    content: 'c',
    sourceUrl: 'https://example.com/p',
    sourcePlatform: 'manual',
    images: [],
    sentiment: 0,
    postedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: rpcRow, error: null });
});

describe('post.repository createPost → create_post_atomic RPC plumbing (#89 / D2)', () => {
  it("forwards source: 'seed' as p_source", async () => {
    await createPost(baseInput({ source: 'seed' }), 'user-1');

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [name, params] = rpcMock.mock.calls[0];
    expect(name).toBe('create_post_atomic');
    expect(params.p_source).toBe('seed');
  });

  it('forwards p_source: null when source is omitted', async () => {
    await createPost(baseInput(), 'user-1');

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [, params] = rpcMock.mock.calls[0];
    expect(params.p_source).toBeNull();
  });

  it("forwards source: 'user' as p_source", async () => {
    await createPost(baseInput({ source: 'user' }), 'user-1');

    const [, params] = rpcMock.mock.calls[0];
    expect(params.p_source).toBe('user');
  });
});

describe('post.repository createPost defensive stockIds dedup (#91 / D4)', () => {
  // Regression test for D4 / GitHub #91. Repository-layer defense in depth
  // for callers that bypass the AI-service layer (where the primary dedup at
  // ai.service.ts:895 lives). Either layer alone catches the bug; both
  // together make non-AI callers safe by construction.
  it('collapses duplicate stockIds before constructing p_stocks', async () => {
    await createPost(
      baseInput({
        stockIds: ['s1', 's1', 's2', 's1'],
        stockSentiments: { s1: 1, s2: -1 },
      }),
      'user-1'
    );

    const [, params] = rpcMock.mock.calls[0];
    const pStocks = params.p_stocks as { stock_id: string; sentiment: number | null }[];
    expect(pStocks).toHaveLength(2);
    const ids = pStocks.map((s) => s.stock_id).sort();
    expect(ids).toEqual(['s1', 's2']);
    // sentiments are still keyed by stock_id, so dedup mustn't drop them
    const s1 = pStocks.find((s) => s.stock_id === 's1');
    const s2 = pStocks.find((s) => s.stock_id === 's2');
    expect(s1?.sentiment).toBe(1);
    expect(s2?.sentiment).toBe(-1);
  });

  it('passes through unique stockIds unchanged', async () => {
    await createPost(baseInput({ stockIds: ['s1', 's2', 's3'] }), 'user-1');

    const [, params] = rpcMock.mock.calls[0];
    const pStocks = params.p_stocks as { stock_id: string }[];
    expect(pStocks).toHaveLength(3);
    expect(pStocks.map((s) => s.stock_id).sort()).toEqual(['s1', 's2', 's3']);
  });
});
