import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWrapper } from '@/test/query-wrapper';
import { useDrafts, useDraft, useDraftCount, useCreateDraft, useDeleteDraft } from '../use-drafts';

const fetchMock = vi.fn();
global.fetch = fetchMock;

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useDrafts', () => {
  it('fetches draft list', async () => {
    const payload = { data: [{ id: 'd1' }], total: 1 };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(payload),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDrafts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
  });

  it('passes pagination params', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], total: 0 }),
    });

    const { wrapper } = createWrapper();
    renderHook(() => useDrafts({ page: 2, limit: 10 }), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('page=2');
    expect(url).toContain('limit=10');
  });
});

describe('useDraft', () => {
  it('fetches a single draft by id', async () => {
    const draft = { id: 'd1', content: 'test' };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(draft),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDraft('d1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(draft);
  });

  it('does not fetch when id is empty', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDraft(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useDraftCount', () => {
  it('returns count on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ count: 5 }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDraftCount(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(5);
  });

  it('returns 0 on non-OK response (graceful fallback)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDraftCount(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });
});

describe('useCreateDraft', () => {
  it('sends POST and invalidates drafts queries', async () => {
    const newDraft = { id: 'd2' };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(newDraft),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateDraft(), { wrapper });

    result.current.mutate({ content: 'draft content' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['drafts', 'list'] })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['drafts', 'count'] })
    );
  });
});

describe('useDeleteDraft', () => {
  it('sends DELETE and invalidates drafts queries', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteDraft(), { wrapper });

    result.current.mutate('d1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/drafts/d1');
    expect(opts.method).toBe('DELETE');

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['drafts', 'list'] })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['drafts', 'count'] })
    );
  });
});
