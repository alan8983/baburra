import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWrapper } from '@/test/query-wrapper';
import {
  useAiUsage,
  useAnalyzeSentiment,
  useExtractArguments,
  useIdentifyTickers,
} from '../use-ai';

const fetchMock = vi.fn();
global.fetch = fetchMock;

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useAiUsage', () => {
  it('fetches AI usage data', async () => {
    const usage = {
      usageCount: 3,
      weeklyLimit: 10,
      remaining: 7,
      resetAt: null,
      subscriptionTier: 'free',
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(usage),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAiUsage(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(usage);
  });

  it('throws on non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED', message: 'Not logged in' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAiUsage(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Not logged in');
  });
});

describe('useAnalyzeSentiment', () => {
  it('sends content and returns sentiment analysis', async () => {
    const response = {
      sentiment: 2,
      confidence: 0.9,
      reasoning: 'bullish',
      usage: { remaining: 5, weeklyLimit: 10, resetAt: '' },
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAnalyzeSentiment(), { wrapper });

    result.current.mutate('AAPL is going to the moon');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(response);

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ content: 'AAPL is going to the moon' });

    // Should invalidate ai-usage
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['ai-usage'] }));
  });

  it('throws on API error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () =>
        Promise.resolve({ error: { code: 'AI_QUOTA_EXCEEDED', message: 'Quota exceeded' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAnalyzeSentiment(), { wrapper });

    result.current.mutate('test content');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Quota exceeded');
  });
});

describe('useExtractArguments', () => {
  it('sends extraction request with correct body', async () => {
    const response = { arguments: [], usage: { remaining: 4, weeklyLimit: 10, resetAt: '' } };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useExtractArguments(), { wrapper });

    const input = {
      content: 'Apple revenue up',
      postId: 'p1',
      stocks: [{ id: 's1', ticker: 'AAPL', name: 'Apple' }],
    };
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual(input);
  });
});

describe('useIdentifyTickers', () => {
  it('sends content and returns identified tickers', async () => {
    const response = {
      tickers: [
        { ticker: 'AAPL', name: 'Apple', market: 'US', confidence: 0.95, mentionedAs: 'Apple' },
      ],
      usage: { remaining: 3, weeklyLimit: 10, resetAt: '' },
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useIdentifyTickers(), { wrapper });

    result.current.mutate('I think Apple will beat earnings');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.tickers).toHaveLength(1);
    expect(result.current.data?.tickers[0].ticker).toBe('AAPL');
  });
});
