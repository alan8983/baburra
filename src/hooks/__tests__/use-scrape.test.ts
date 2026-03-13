import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWrapper } from '@/test/query-wrapper';
import {
  useInitiateScrape,
  useScrapeJob,
  useScrapeJobs,
  useActiveScrapeForKol,
} from '../use-scrape';

const fetchMock = vi.fn();
global.fetch = fetchMock;

beforeEach(() => {
  fetchMock.mockReset();
});

// ── useInitiateScrape ──

describe('useInitiateScrape', () => {
  it('sends POST to /api/scrape/profile with profileUrl', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          jobId: 'job-1',
          kolId: 'kol-1',
          kolName: 'TraderJoe',
          sourceId: 'src-1',
          totalUrls: 10,
          status: 'queued',
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useInitiateScrape(), { wrapper });

    result.current.mutate({ url: 'https://youtube.com/@traderjoe' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/scrape/profile');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ profileUrl: 'https://youtube.com/@traderjoe' });
  });

  it('returns { id, jobId } on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          jobId: 'job-1',
          kolId: 'kol-1',
          kolName: 'TraderJoe',
          sourceId: 'src-1',
          totalUrls: 10,
          status: 'queued',
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useInitiateScrape(), { wrapper });

    result.current.mutate({ url: 'https://youtube.com/@traderjoe' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'job-1', jobId: 'job-1' });
  });

  it('invalidates scrape jobs queries on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          jobId: 'job-1',
          kolId: 'kol-1',
          kolName: 'TraderJoe',
          sourceId: 'src-1',
          totalUrls: 5,
          status: 'queued',
        }),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useInitiateScrape(), { wrapper });

    result.current.mutate({ url: 'https://youtube.com/@traderjoe' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['scrape', 'jobs'] })
    );
  });

  it('handles API error response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: { message: 'Rate limited' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useInitiateScrape(), { wrapper });

    result.current.mutate({ url: 'https://youtube.com/@traderjoe' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('handles network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useInitiateScrape(), { wrapper });

    result.current.mutate({ url: 'https://youtube.com/@traderjoe' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Network error');
  });
});

// ── useScrapeJob ──

describe('useScrapeJob', () => {
  it('fetches job data from the correct endpoint', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'job-1',
          status: 'completed',
          processedUrls: 10,
          totalUrls: 10,
          importedCount: 8,
          duplicateCount: 2,
          errorCount: 0,
          createdAt: '2026-03-13T10:00:00Z',
          updatedAt: '2026-03-13T10:05:00Z',
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useScrapeJob('job-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // First fetch call should be to the job endpoint
    expect(fetchMock.mock.calls[0][0]).toBe('/api/scrape/jobs/job-1');
    expect(result.current.data?.id).toBe('job-1');
    expect(result.current.data?.status).toBe('completed');
  });

  it('does not fetch when jobId is null', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useScrapeJob(null), { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires POST to /continue when job is processing with remaining URLs', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'job-1',
          status: 'processing',
          processedUrls: 5,
          totalUrls: 10,
          importedCount: 5,
          duplicateCount: 0,
          errorCount: 0,
          createdAt: '2026-03-13T10:00:00Z',
          updatedAt: '2026-03-13T10:02:00Z',
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useScrapeJob('job-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should have called both the job endpoint AND the continue endpoint
    const calls = fetchMock.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('/api/scrape/jobs/job-1/continue');

    // The /continue call should be a POST
    const continueCall = fetchMock.mock.calls.find(
      (c: unknown[]) => c[0] === '/api/scrape/jobs/job-1/continue'
    );
    expect(continueCall?.[1]?.method).toBe('POST');
  });

  it('does NOT fire /continue when status is completed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'job-1',
          status: 'completed',
          processedUrls: 10,
          totalUrls: 10,
          importedCount: 10,
          duplicateCount: 0,
          errorCount: 0,
          createdAt: '2026-03-13T10:00:00Z',
          updatedAt: '2026-03-13T10:05:00Z',
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useScrapeJob('job-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calls = fetchMock.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).not.toContain('/api/scrape/jobs/job-1/continue');
  });

  it('does NOT fire /continue when processedUrls >= totalUrls', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'job-1',
          status: 'processing',
          processedUrls: 10,
          totalUrls: 10,
          importedCount: 10,
          duplicateCount: 0,
          errorCount: 0,
          createdAt: '2026-03-13T10:00:00Z',
          updatedAt: '2026-03-13T10:05:00Z',
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useScrapeJob('job-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calls = fetchMock.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).not.toContain('/api/scrape/jobs/job-1/continue');
  });

  it('/continue failure is silently caught', async () => {
    let callCount = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/continue')) {
        return Promise.reject(new Error('Network error'));
      }
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'job-1',
            status: 'processing',
            processedUrls: 5,
            totalUrls: 10,
            importedCount: 5,
            duplicateCount: 0,
            errorCount: 0,
            createdAt: '2026-03-13T10:00:00Z',
            updatedAt: '2026-03-13T10:02:00Z',
          }),
      });
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useScrapeJob('job-1'), { wrapper });

    // Should not throw — the /continue error is caught
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(callCount).toBeGreaterThanOrEqual(1);
  });
});

// ── useScrapeJobs ──

describe('useScrapeJobs', () => {
  it('fetches job list from /api/scrape/jobs', async () => {
    const jobs = [
      {
        id: 'job-1',
        status: 'completed',
        createdAt: '2026-03-13T10:00:00Z',
        updatedAt: '2026-03-13T10:05:00Z',
      },
      {
        id: 'job-2',
        status: 'processing',
        createdAt: '2026-03-13T11:00:00Z',
        updatedAt: '2026-03-13T11:02:00Z',
      },
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(jobs),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useScrapeJobs(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0][0]).toBe('/api/scrape/jobs');
    expect(result.current.data).toHaveLength(2);
  });
});

// ── useActiveScrapeForKol ──

describe('useActiveScrapeForKol', () => {
  it('returns active job matching kolId', async () => {
    const jobs = [
      {
        id: 'job-1',
        kolId: 'kol-1',
        status: 'completed',
        createdAt: '2026-03-13T10:00:00Z',
        updatedAt: '2026-03-13T10:05:00Z',
      },
      {
        id: 'job-2',
        kolId: 'kol-1',
        status: 'processing',
        createdAt: '2026-03-13T11:00:00Z',
        updatedAt: '2026-03-13T11:02:00Z',
      },
      {
        id: 'job-3',
        kolId: 'kol-2',
        status: 'queued',
        createdAt: '2026-03-13T12:00:00Z',
        updatedAt: '2026-03-13T12:00:00Z',
      },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(jobs),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useActiveScrapeForKol('kol-1'), { wrapper });

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.id).toBe('job-2');
    expect(result.current?.status).toBe('processing');
  });

  it('returns null when no active job matches', async () => {
    const jobs = [
      {
        id: 'job-1',
        kolId: 'kol-1',
        status: 'completed',
        createdAt: '2026-03-13T10:00:00Z',
        updatedAt: '2026-03-13T10:05:00Z',
      },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(jobs),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useActiveScrapeForKol('kol-1'), { wrapper });

    // useActiveScrapeForKol returns null synchronously when no active (processing/queued) job matches
    // Even after data loads, the result stays null because no job has an active status
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('returns null when kolId is undefined', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useActiveScrapeForKol(undefined), { wrapper });

    expect(result.current).toBeNull();
  });
});
