import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWrapper } from '@/test/query-wrapper';
import { usePosts, usePost, useCreatePost, useDeletePost } from '../use-posts';

const fetchMock = vi.fn();
global.fetch = fetchMock;

beforeEach(() => {
  fetchMock.mockReset();
});

describe('usePosts', () => {
  it('fetches post list successfully', async () => {
    const payload = { data: [{ id: 'p1', title: 'Post 1' }], total: 1 };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(payload),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePosts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
  });

  it('passes filter params to URL', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], total: 0 }),
    });

    const { wrapper } = createWrapper();
    renderHook(() => usePosts({ kolId: 'k1', stockTicker: 'AAPL', page: 3 }), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('kolId=k1');
    expect(url).toContain('stockTicker=AAPL');
    expect(url).toContain('page=3');
  });

  it('throws on non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { code: 'INTERNAL_ERROR', message: 'server error' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePosts(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('server error');
  });
});

describe('usePost', () => {
  it('fetches a single post by id', async () => {
    const post = { id: 'p1', content: 'Hello' };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(post),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePost('p1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(post);
  });

  it('does not fetch when id is empty', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePost(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useCreatePost', () => {
  it('sends POST and invalidates list queries', async () => {
    const newPost = { id: 'p2' };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(newPost),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreatePost(), { wrapper });

    const input = {
      kolId: 'k1',
      content: 'test',
      sentiment: 1 as const,
      postedAt: new Date('2024-01-01'),
      stockIds: ['s1'],
      sourcePlatform: 'manual' as const,
    };
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.kolId).toBe('k1');
    expect(body.content).toBe('test');
    expect(body.sentiment).toBe(1);
    expect(body.stockIds).toEqual(['s1']);
    expect(body.sourcePlatform).toBe('manual');

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['posts', 'list'] })
    );
  });
});

describe('useDeletePost', () => {
  it('sends DELETE and invalidates list queries', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeletePost(), { wrapper });

    result.current.mutate('p1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/posts/p1');
    expect(opts.method).toBe('DELETE');

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['posts', 'list'] })
    );
  });
});
