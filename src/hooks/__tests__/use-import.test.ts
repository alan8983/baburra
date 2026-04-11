import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWrapper } from '@/test/query-wrapper';
import { useImportBatch } from '../use-import';

const fetchMock = vi.fn();
global.fetch = fetchMock;

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useImportBatch (async job)', () => {
  it('sends POST with urls and returns { jobId, totalUrls }', async () => {
    const jobResponse = { jobId: 'job-abc', totalUrls: 1 };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(jobResponse),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useImportBatch(), { wrapper });

    result.current.mutate({ urls: ['https://x.com/a/status/1'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(jobResponse);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/import/batch');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ urls: ['https://x.com/a/status/1'] });
  });

  it('forwards multiple urls in a single request', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ jobId: 'job-xyz', totalUrls: 3 }),
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
    expect(result.current.data).toEqual({ jobId: 'job-xyz', totalUrls: 3 });
  });

  it('invalidates scrape job lists on success so the new job appears immediately', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ jobId: 'job-1', totalUrls: 1 }),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportBatch(), { wrapper });

    result.current.mutate({ urls: ['https://x.com/a/status/1'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The new flow relies on the scrape-jobs list (not kol/post lists) —
    // the per-URL UI will drive kol/post invalidation as items finish.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['scrape', 'jobs'] })
    );
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
