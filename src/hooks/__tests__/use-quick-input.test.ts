import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWrapper } from '@/test/query-wrapper';
import { useQuickInput } from '../use-quick-input';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const fetchMock = vi.fn();
global.fetch = fetchMock;

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useQuickInput', () => {
  it('sends POST with content and returns draft', async () => {
    const response = { draft: { id: 'd1' } };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useQuickInput(), { wrapper });

    result.current.mutate('https://x.com/post/123');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(response);

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ content: 'https://x.com/post/123' });

    // Should invalidate drafts and ai-usage
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['drafts', 'list'] })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['ai-usage'] }));
  });

  it('maps error code to i18n friendly message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ error: { code: 'UNSUPPORTED_URL', message: 'URL not supported' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useQuickInput(), { wrapper });

    result.current.mutate('https://unsupported.com/post');

    await waitFor(() => expect(result.current.isError).toBe(true));
    // The mock t() returns the key path — useQuickInput maps UNSUPPORTED_URL to t('errors.unsupportedUrl')
    expect(result.current.error?.message).toBe('errors.unsupportedUrl');
  });

  it('falls back to server message for unknown error codes', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ error: { code: 'UNKNOWN_CODE', message: 'Something went wrong' } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useQuickInput(), { wrapper });

    result.current.mutate('content');

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Falls back to err.message from the server
    expect(result.current.error?.message).toBe('Something went wrong');
  });
});
