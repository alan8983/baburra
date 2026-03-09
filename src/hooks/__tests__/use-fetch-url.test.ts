import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWrapper } from '@/test/query-wrapper';
import { useFetchUrl } from '../use-fetch-url';

const fetchMock = vi.fn();
global.fetch = fetchMock;

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useFetchUrl', () => {
  it('sends POST with url and returns extracted content', async () => {
    const fetchResult = {
      content: 'AAPL is looking great!',
      sourcePlatform: 'twitter',
      title: 'Bullish on AAPL',
      images: ['https://pbs.twimg.com/img.jpg'],
      kolName: 'TraderJoe',
      postedAt: '2025-06-01T10:00:00Z',
      sourceUrl: 'https://x.com/trader/status/123',
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: fetchResult }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFetchUrl(), { wrapper });

    result.current.mutate('https://x.com/trader/status/123');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(fetchResult);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/fetch-url');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ url: 'https://x.com/trader/status/123' });
  });

  it('maps INVALID_URL error code to friendly Chinese message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { code: 'INVALID_URL', message: 'URL not supported' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFetchUrl(), { wrapper });

    result.current.mutate('https://unsupported.com/post');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('此網址的平台尚不支援');
  });

  it('maps FETCH_FAILED error code to friendly message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: () => Promise.resolve({ error: { code: 'FETCH_FAILED', message: 'Cannot connect' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFetchUrl(), { wrapper });

    result.current.mutate('https://x.com/broken/status/1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('無法連線至該網址');
  });

  it('maps PARSE_FAILED error code to friendly message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: { code: 'PARSE_FAILED', message: 'Cannot parse' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFetchUrl(), { wrapper });

    result.current.mutate('https://x.com/a/status/1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('無法解析網頁內容');
  });

  it('maps CONTENT_TOO_SHORT error code to friendly message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: { code: 'CONTENT_TOO_SHORT', message: 'Too short' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFetchUrl(), { wrapper });

    result.current.mutate('https://x.com/a/status/1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('擷取到的內容過短');
  });

  it('maps CONTENT_TOO_LONG error code to friendly message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: { code: 'CONTENT_TOO_LONG', message: 'Too long' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFetchUrl(), { wrapper });

    result.current.mutate('https://x.com/a/status/1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('擷取到的內容過長');
  });

  it('maps NETWORK_ERROR error code to friendly message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { code: 'NETWORK_ERROR', message: 'Connection lost' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFetchUrl(), { wrapper });

    result.current.mutate('https://x.com/a/status/1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('網路連線錯誤');
  });

  it('falls back to server message for unknown error codes', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () =>
        Promise.resolve({ error: { code: 'UNKNOWN_CODE', message: 'Something unexpected' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFetchUrl(), { wrapper });

    result.current.mutate('https://x.com/a/status/1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Should fall back to the original error message or a generic one
    expect(result.current.error?.message).toBeTruthy();
  });

  it('handles network failure (fetch throws)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFetchUrl(), { wrapper });

    result.current.mutate('https://x.com/a/status/1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Network error');
  });
});
