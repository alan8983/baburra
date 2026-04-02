import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateAuthHeaders, searchByTerm } from '../podcast-index.client';

describe('generateAuthHeaders', () => {
  it('generates correct auth headers with deterministic epoch', () => {
    const headers = generateAuthHeaders('testkey', 'testsecret', 1700000000);

    expect(headers['X-Auth-Key']).toBe('testkey');
    expect(headers['X-Auth-Date']).toBe('1700000000');
    expect(headers['User-Agent']).toBe('Baburra/1.0');
    // Authorization is SHA-1 of "testkeytestsecret1700000000"
    expect(headers.Authorization).toMatch(/^[a-f0-9]{40}$/);
  });

  it('uses current epoch when not provided', () => {
    const before = Math.floor(Date.now() / 1000);
    const headers = generateAuthHeaders('key', 'secret');
    const after = Math.floor(Date.now() / 1000);

    const epoch = parseInt(headers['X-Auth-Date'], 10);
    expect(epoch).toBeGreaterThanOrEqual(before);
    expect(epoch).toBeLessThanOrEqual(after);
  });
});

describe('searchByTerm', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('throws when env vars are missing', async () => {
    delete process.env.PODCAST_INDEX_KEY;
    delete process.env.PODCAST_INDEX_SECRET;

    await expect(searchByTerm('test')).rejects.toThrow(
      'PODCAST_INDEX_KEY and PODCAST_INDEX_SECRET environment variables are required'
    );
  });

  it('returns parsed results on success', async () => {
    process.env.PODCAST_INDEX_KEY = 'testkey';
    process.env.PODCAST_INDEX_SECRET = 'testsecret';

    const mockResponse = {
      status: 'true',
      feeds: [
        {
          url: 'https://example.com/feed.xml',
          podcastGuid: 'abc-123',
          title: 'Investment Pod',
        },
      ],
      count: 1,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const results = await searchByTerm('investment');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      feedUrl: 'https://example.com/feed.xml',
      podcastGuid: 'abc-123',
      title: 'Investment Pod',
    });
  });

  it('returns empty array for no results', async () => {
    process.env.PODCAST_INDEX_KEY = 'testkey';
    process.env.PODCAST_INDEX_SECRET = 'testsecret';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'true', feeds: [], count: 0 }),
    } as Response);

    const results = await searchByTerm('nonexistent');
    expect(results).toEqual([]);
  });

  it('throws on API error', async () => {
    process.env.PODCAST_INDEX_KEY = 'testkey';
    process.env.PODCAST_INDEX_SECRET = 'testsecret';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    await expect(searchByTerm('test')).rejects.toThrow('PodcastIndex API error: 500');
  });
});
