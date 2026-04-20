import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { listBookmarksByUserId } from '../bookmark.repository';

const USER_A = 'user-a';
const USER_B = 'user-b';

function makeRow(
  overrides: Partial<{
    id: string;
    user_id: string;
    post_id: string;
    created_at: string;
    post: object | null;
  }> = {}
) {
  return {
    id: 'bm-1',
    user_id: USER_A,
    post_id: 'post-1',
    created_at: '2025-01-01T00:00:00Z',
    post: {
      id: 'post-1',
      title: 'Test Post',
      content: 'body',
      sentiment: 1,
      posted_at: '2025-01-01T00:00:00Z',
      kol: { id: 'kol-1', name: 'KOL Name', avatar_url: null },
      post_stocks: [{ stocks: { id: 'stock-1', ticker: 'AAPL', name: 'Apple' } }],
    },
    ...overrides,
  };
}

function buildChain(data: unknown[], count = 1) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data, count, error: null }),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listBookmarksByUserId', () => {
  it('returns correct BookmarkWithPost shape', async () => {
    buildChain([makeRow()], 1);

    const { data, total } = await listBookmarksByUserId(USER_A);

    expect(total).toBe(1);
    expect(data).toHaveLength(1);
    const b = data[0];
    expect(b.id).toBe('bm-1');
    expect(b.userId).toBe(USER_A);
    expect(b.postId).toBe('post-1');
    expect(b.post.id).toBe('post-1');
    expect(b.post.title).toBe('Test Post');
    expect(b.post.kol.name).toBe('KOL Name');
    expect(b.post.stocks).toEqual([{ id: 'stock-1', ticker: 'AAPL', name: 'Apple' }]);
  });

  it('filters bookmarks whose post is null (orphan bookmarks excluded)', async () => {
    buildChain([makeRow({ post: null })], 1);

    const { data } = await listBookmarksByUserId(USER_A);
    expect(data).toHaveLength(0);
  });

  it('returns empty when no bookmarks', async () => {
    buildChain([], 0);

    const { data, total } = await listBookmarksByUserId(USER_A);
    expect(data).toHaveLength(0);
    expect(total).toBe(0);
  });

  it('filters by user_id (user A cannot see user B bookmarks)', async () => {
    const chain = buildChain([makeRow({ user_id: USER_A })], 1);

    await listBookmarksByUserId(USER_A);
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_A);

    vi.clearAllMocks();
    const chain2 = buildChain([makeRow({ user_id: USER_B })], 1);
    await listBookmarksByUserId(USER_B);
    expect(chain2.eq).toHaveBeenCalledWith('user_id', USER_B);
  });

  it('applies pagination with page=2, limit=10', async () => {
    const chain = buildChain([], 0);

    await listBookmarksByUserId(USER_A, { page: 2, limit: 10 });
    // from = (2-1)*10 = 10, to = 19
    expect(chain.range).toHaveBeenCalledWith(10, 19);
  });

  it('uses a single .from("bookmarks") call — 1 query not 5', async () => {
    buildChain([makeRow()], 1);

    await listBookmarksByUserId(USER_A);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('bookmarks');
  });
});
