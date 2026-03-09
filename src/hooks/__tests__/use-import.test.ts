import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWrapper } from '@/test/query-wrapper';
import { useImportBatch } from '../use-import';

const fetchMock = vi.fn();
global.fetch = fetchMock;

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useImportBatch', () => {
  it('sends POST with urls and returns batch result', async () => {
    const batchResult = {
      kols: [{ kolId: 'kol-1', kolName: 'TraderJoe', kolCreated: true, postCount: 1 }],
      urlResults: [{ url: 'https://x.com/a/status/1', status: 'success', postId: 'post-1' }],
      totalImported: 1,
      totalDuplicate: 0,
      totalError: 0,
      onboardingQuotaUsed: false,
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(batchResult),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useImportBatch(), { wrapper });

    result.current.mutate({ urls: ['https://x.com/a/status/1'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(batchResult);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/import/batch');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ urls: ['https://x.com/a/status/1'] });
  });

  it('sends multiple urls in a single request', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          kols: [],
          urlResults: [],
          totalImported: 0,
          totalDuplicate: 0,
          totalError: 0,
          onboardingQuotaUsed: false,
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useImportBatch(), { wrapper });

    const urls = [
      'https://x.com/a/status/1',
      'https://x.com/b/status/2',
      'https://youtube.com/watch?v=abc',
    ];
    result.current.mutate({ urls });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.urls).toHaveLength(3);
  });

  it('invalidates kol, post, and ai-usage queries on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          kols: [],
          urlResults: [],
          totalImported: 1,
          totalDuplicate: 0,
          totalError: 0,
          onboardingQuotaUsed: false,
        }),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportBatch(), { wrapper });

    result.current.mutate({ urls: ['https://x.com/a/status/1'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['kols', 'list'] })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['posts', 'list'] })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['ai-usage'] }));
  });

  it('handles API error responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Unauthorized' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useImportBatch(), { wrapper });

    result.current.mutate({ urls: ['https://x.com/a/status/1'] });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('handles network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useImportBatch(), { wrapper });

    result.current.mutate({ urls: ['https://x.com/a/status/1'] });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Network error');
  });
});
