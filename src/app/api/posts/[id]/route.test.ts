import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetCurrentUserId = vi.fn();
const mockGetPostById = vi.fn();
const mockEnrich = vi.fn();
const mockGetAiModelVersion = vi.fn(() => 'gemini-2.0-flash');

vi.mock('@/infrastructure/supabase/server', () => ({
  getCurrentUserId: () => mockGetCurrentUserId(),
}));

vi.mock('@/infrastructure/repositories', () => ({
  getPostById: (id: string) => mockGetPostById(id),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
}));

vi.mock('@/lib/api/enrich-price-changes', () => ({
  enrichPostsWithPriceChanges: (posts: unknown[]) => mockEnrich(posts),
}));

vi.mock('@/infrastructure/api/gemini.client', () => ({
  getAiModelVersion: () => mockGetAiModelVersion(),
}));

import { GET } from './route';

function makeRequest() {
  return new NextRequest('http://localhost/api/posts/abc');
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/posts/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not logged in', async () => {
    mockGetCurrentUserId.mockResolvedValue(null);

    const res = await GET(makeRequest(), makeParams('abc'));

    expect(res.status).toBe(401);
    expect(mockGetPostById).not.toHaveBeenCalled();
  });

  it('returns 200 with post content when user is logged in', async () => {
    mockGetCurrentUserId.mockResolvedValue('user-1');
    const post = { id: 'abc', title: 'Test post', content: 'hi' };
    mockGetPostById.mockResolvedValue(post);
    mockEnrich.mockResolvedValue(undefined);

    const res = await GET(makeRequest(), makeParams('abc'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: 'abc',
      title: 'Test post',
      currentAiModel: 'gemini-2.0-flash',
    });
    expect(mockGetPostById).toHaveBeenCalledWith('abc');
  });

  it('returns 404 when logged in but post does not exist', async () => {
    mockGetCurrentUserId.mockResolvedValue('user-1');
    mockGetPostById.mockResolvedValue(null);

    const res = await GET(makeRequest(), makeParams('missing'));

    expect(res.status).toBe(404);
    expect(mockEnrich).not.toHaveBeenCalled();
  });
});
