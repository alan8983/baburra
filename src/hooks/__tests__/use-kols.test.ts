import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWrapper } from '@/test/query-wrapper';
import { useKols, useKol, useCreateKol } from '../use-kols';

const fetchMock = vi.fn();
global.fetch = fetchMock;

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useKols', () => {
  it('fetches KOL list successfully', async () => {
    const payload = { data: [{ id: '1', name: 'Alice' }], total: 1 };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(payload),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useKols(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/kols');
  });

  it('passes search params to URL', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], total: 0 }),
    });

    const { wrapper } = createWrapper();
    renderHook(() => useKols({ search: 'test', page: 2, limit: 5 }), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('search=test');
    expect(url).toContain('page=2');
    expect(url).toContain('limit=5');
  });

  it('throws ApiError on non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { code: 'INTERNAL_ERROR', message: 'fail' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useKols(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('fail');
  });
});

describe('useKol', () => {
  it('fetches a single KOL by id', async () => {
    const kol = { id: '1', name: 'Alice', postCount: 5 };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(kol),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useKol('1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(kol);
  });

  it('does not fetch when id is empty', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useKol(''), { wrapper });

    // Should stay in idle/pending state without fetching
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useCreateKol', () => {
  it('sends POST request and invalidates list queries on success', async () => {
    const newKol = { id: '2', name: 'Bob' };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(newKol),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateKol(), { wrapper });

    result.current.mutate({ name: 'Bob' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(newKol);

    // Verify POST method and body
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ name: 'Bob' });

    // Verify query invalidation
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['kols', 'list'] })
    );
  });

  it('throws ApiError on mutation failure', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ error: { code: 'VALIDATION_ERROR', message: 'Name required' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateKol(), { wrapper });

    result.current.mutate({ name: '' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Name required');
  });
});
