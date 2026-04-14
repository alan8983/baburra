/**
 * Ensures that sentiment-writing paths in `post.repository.ts` fire the
 * win-rate sample cache invalidation hook. The hook just deletes rows from
 * `post_win_rate_samples`; the next read re-fills them under the new
 * sentiment values.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invalidateMock = vi.fn<(postId: string) => Promise<void>>();

vi.mock('../win-rate-sample.repository', () => ({
  invalidateByPost: (id: string) => invalidateMock(id),
  // The other exports aren't touched by post.repository directly but are
  // re-exported through the repositories barrel — stub them out to prevent
  // accidental execution during import.
  loadSamplesByPostIds: vi.fn(),
  loadSamplesByPostId: vi.fn(),
  upsertSamples: vi.fn(),
  invalidateByPostStock: vi.fn(),
  clearByTicker: vi.fn(),
  sampleKey: (p: string, s: string, d: number) => `${p}:${s}:${d}`,
}));

// Minimal Supabase chainable mock — only the methods post.repository uses are
// implemented; everything returns an awaitable `{ data, error }` shape.
function makeChain(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    or: vi.fn(() => chain),
    is: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
  };
  return chain;
}

const fromMock = vi.fn();

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({
    from: fromMock,
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  }),
}));

import { updatePost, updatePostAiAnalysis } from '../post.repository';

const postRow = {
  id: 'post-1',
  kol_id: 'k',
  title: null,
  content: 'c',
  source_url: null,
  source_platform: 'manual',
  images: [],
  sentiment: 2,
  sentiment_ai_generated: false,
  ai_model_version: 'v1',
  posted_at: '2024-01-01T00:00:00.000Z',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  created_by: 'u',
  primary_post_id: null,
  content_fingerprint: null,
};

beforeEach(() => {
  invalidateMock.mockReset();
  invalidateMock.mockResolvedValue(undefined);
  fromMock.mockReset();
});

describe('post.repository sentiment → sample invalidation', () => {
  it('updatePostAiAnalysis invalidates cached samples after writing sentiment', async () => {
    fromMock.mockImplementation(() => makeChain({ data: postRow, error: null }));

    await updatePostAiAnalysis('post-1', { sentiment: 1, aiModelVersion: 'v2' });

    expect(invalidateMock).toHaveBeenCalledWith('post-1');
  });

  it('updatePost invalidates when sentiment changes', async () => {
    fromMock.mockImplementation(() => makeChain({ data: postRow, error: null }));

    await updatePost('post-1', 'u', { sentiment: 1 });

    expect(invalidateMock).toHaveBeenCalledWith('post-1');
  });

  it('updatePost does NOT invalidate when only non-sentiment fields change', async () => {
    fromMock.mockImplementation(() => makeChain({ data: postRow, error: null }));

    await updatePost('post-1', 'u', { title: 'new title' });

    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it('updatePost invalidates when stockSentiments change', async () => {
    fromMock.mockImplementation(() => makeChain({ data: postRow, error: null }));

    await updatePost('post-1', 'u', { stockSentiments: { 'stock-a': 1 } });

    expect(invalidateMock).toHaveBeenCalledWith('post-1');
  });
});
