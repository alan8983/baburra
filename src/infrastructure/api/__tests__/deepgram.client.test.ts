import { Readable } from 'stream';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deepgramTranscribe, formatTranscript, extractActualDuration } from '../deepgram.client';

describe('deepgram.client', () => {
  describe('formatTranscript', () => {
    it('formats utterances with speaker labels and timestamps', () => {
      const utterances = [
        { speaker: 0, start: 83, end: 165, transcript: 'First utterance text here' },
        { speaker: 0, start: 165, end: 250, transcript: 'Second utterance from same speaker' },
        { speaker: 1, start: 210, end: 300, transcript: 'Third from different speaker' },
      ];

      const result = formatTranscript(utterances);

      expect(result).toBe(
        [
          '[Speaker 0, 00:01:23] First utterance text here',
          '[Speaker 0, 00:02:45] Second utterance from same speaker',
          '[Speaker 1, 00:03:30] Third from different speaker',
        ].join('\n')
      );
    });

    it('handles single speaker (monologue)', () => {
      const utterances = [
        { speaker: 0, start: 0, end: 60, transcript: 'Hello' },
        { speaker: 0, start: 60, end: 120, transcript: 'World' },
      ];

      const result = formatTranscript(utterances);

      expect(result).toBe(
        ['[Speaker 0, 00:00:00] Hello', '[Speaker 0, 00:01:00] World'].join('\n')
      );
    });

    it('handles empty utterances', () => {
      expect(formatTranscript([])).toBe('');
    });

    it('formats timestamps over 1 hour correctly', () => {
      const utterances = [{ speaker: 0, start: 3661, end: 3700, transcript: 'Over one hour in' }];

      expect(formatTranscript(utterances)).toBe('[Speaker 0, 01:01:01] Over one hour in');
    });
  });

  describe('extractActualDuration', () => {
    it('extracts duration from last utterance timestamp', () => {
      const transcript = [
        '[Speaker 0, 00:00:00] Hello',
        '[Speaker 1, 00:05:30] World',
        '[Speaker 0, 00:42:15] Last utterance',
      ].join('\n');

      expect(extractActualDuration(transcript)).toBe(42 * 60 + 15);
    });

    it('returns null for transcript with no timestamps', () => {
      expect(extractActualDuration('Just plain text without timestamps')).toBeNull();
    });

    it('handles single utterance', () => {
      expect(extractActualDuration('[Speaker 0, 01:01:01] Only one')).toBe(3661);
    });

    it('returns null for empty string', () => {
      expect(extractActualDuration('')).toBeNull();
    });
  });

  describe('deepgramTranscribe', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, DEEPGRAM_API_KEY: 'test-key' };
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('throws when DEEPGRAM_API_KEY is not set', async () => {
      delete process.env.DEEPGRAM_API_KEY;

      await expect(deepgramTranscribe(Buffer.from('audio'), 'audio/webm')).rejects.toThrow(
        'DEEPGRAM_API_KEY is not set'
      );
    });

    it('sends correct request and returns formatted transcript', async () => {
      const mockResponse = {
        results: {
          utterances: [
            { speaker: 0, start: 0, end: 10, transcript: 'Hello world' },
            { speaker: 1, start: 10, end: 20, transcript: 'Hi there' },
          ],
        },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );

      const result = await deepgramTranscribe(Buffer.from('audio-data'), 'audio/webm');

      expect(result).toBe('[Speaker 0, 00:00:00] Hello world\n[Speaker 1, 00:00:10] Hi there');

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain('api.deepgram.com/v1/listen');
      expect(url).toContain('model=nova-3');
      expect(url).toContain('diarize=true');
      expect(url).toContain('utterances=true');

      const init = fetchCall[1] as RequestInit;
      expect(init.headers).toEqual(
        expect.objectContaining({
          Authorization: 'Token test-key',
          'Content-Type': 'audio/webm',
        })
      );
    });

    it('falls back to plain transcript when no utterances', async () => {
      const mockResponse = {
        results: {
          channels: [{ alternatives: [{ transcript: 'Plain transcript text' }] }],
        },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );

      const result = await deepgramTranscribe(Buffer.from('audio'), 'audio/mp4');
      expect(result).toBe('Plain transcript text');
    });

    it('throws immediately on non-retryable 400 error', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid audio format'),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(deepgramTranscribe(Buffer.from('bad'), 'audio/webm')).rejects.toThrow(
        'Deepgram API error 400: Invalid audio format'
      );

      // Should NOT retry — only 1 fetch call
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws immediately on non-retryable 401 error', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key'),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(deepgramTranscribe(Buffer.from('bad'), 'audio/webm')).rejects.toThrow(
        'Deepgram API error 401'
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws immediately on non-retryable 403 error', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Access denied'),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(deepgramTranscribe(Buffer.from('bad'), 'audio/webm')).rejects.toThrow(
        'Deepgram API error 403'
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries on transient 503 error and succeeds', async () => {
      // Mock setTimeout to execute immediately (avoids real 5s delay)
      const originalSetTimeout = globalThis.setTimeout;
      vi.stubGlobal('setTimeout', (fn: (...args: unknown[]) => void, _ms?: number) =>
        originalSetTimeout(fn, 0)
      );

      const mockResponse = {
        results: {
          utterances: [{ speaker: 0, start: 0, end: 10, transcript: 'Hello' }],
        },
      };

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          text: () => Promise.resolve(''),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });
      vi.stubGlobal('fetch', fetchMock);

      const result = await deepgramTranscribe(Buffer.from('audio'), 'audio/webm');

      expect(result).toBe('[Speaker 0, 00:00:00] Hello');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      vi.stubGlobal('setTimeout', originalSetTimeout);
    });

    it('retries on transient 429 error and succeeds', async () => {
      const originalSetTimeout = globalThis.setTimeout;
      vi.stubGlobal('setTimeout', (fn: (...args: unknown[]) => void, _ms?: number) =>
        originalSetTimeout(fn, 0)
      );

      const mockResponse = {
        results: {
          utterances: [{ speaker: 0, start: 0, end: 10, transcript: 'Hello' }],
        },
      };

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: () => Promise.resolve(''),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });
      vi.stubGlobal('fetch', fetchMock);

      const result = await deepgramTranscribe(Buffer.from('audio'), 'audio/webm');

      expect(result).toBe('[Speaker 0, 00:00:00] Hello');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      vi.stubGlobal('setTimeout', originalSetTimeout);
    });

    it('exhausts all 3 attempts and throws last error', async () => {
      // Mock setTimeout to execute immediately (avoids real 20s delay)
      const originalSetTimeout = globalThis.setTimeout;
      vi.stubGlobal('setTimeout', (fn: (...args: unknown[]) => void, _ms?: number) =>
        originalSetTimeout(fn, 0)
      );

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve('server down'),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(deepgramTranscribe(Buffer.from('audio'), 'audio/webm')).rejects.toThrow(
        'Deepgram API error 503'
      );

      // 1 original + 2 retries = 3 total attempts
      expect(fetchMock).toHaveBeenCalledTimes(3);
      vi.stubGlobal('setTimeout', originalSetTimeout);
    });

    it('throws when no transcript returned', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: {} }),
        })
      );

      await expect(deepgramTranscribe(Buffer.from('empty'), 'audio/webm')).rejects.toThrow(
        'Deepgram returned no transcript'
      );
    });

    describe('streaming body', () => {
      it('accepts a Readable stream and posts it with duplex: half', async () => {
        process.env.DEEPGRAM_STREAMING_BODY = 'true';

        const mockResponse = {
          results: {
            utterances: [{ speaker: 0, start: 0, end: 10, transcript: 'Streamed hello' }],
          },
        };
        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });
        vi.stubGlobal('fetch', fetchMock);

        const stream = Readable.from([Buffer.from('chunk-1'), Buffer.from('chunk-2')]);

        const result = await deepgramTranscribe(stream, 'audio/webm');

        expect(result).toBe('[Speaker 0, 00:00:00] Streamed hello');

        const init = fetchMock.mock.calls[0][1] as RequestInit & { duplex?: string };
        expect(init.duplex).toBe('half');
        // body should be a web ReadableStream, not a Uint8Array
        expect(init.body).toBeDefined();
        expect(init.body).not.toBeInstanceOf(Uint8Array);
      });

      it('drains the stream into a buffer when DEEPGRAM_STREAMING_BODY=false', async () => {
        process.env.DEEPGRAM_STREAMING_BODY = 'false';

        const mockResponse = {
          results: {
            utterances: [{ speaker: 0, start: 0, end: 10, transcript: 'Buffered hello' }],
          },
        };
        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });
        vi.stubGlobal('fetch', fetchMock);

        const stream = Readable.from([Buffer.from('abc'), Buffer.from('def')]);
        const result = await deepgramTranscribe(stream, 'audio/webm');

        expect(result).toBe('[Speaker 0, 00:00:00] Buffered hello');

        const init = fetchMock.mock.calls[0][1] as RequestInit & { duplex?: string };
        expect(init.duplex).toBeUndefined();
        expect(init.body).toBeInstanceOf(Uint8Array);
        expect((init.body as Uint8Array).byteLength).toBe(6);
      });

      it('fails on retry when a streaming request hits a transient error', async () => {
        process.env.DEEPGRAM_STREAMING_BODY = 'true';

        const originalSetTimeout = globalThis.setTimeout;
        vi.stubGlobal('setTimeout', (fn: (...args: unknown[]) => void, _ms?: number) =>
          originalSetTimeout(fn, 0)
        );

        const fetchMock = vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          text: () => Promise.resolve(''),
        });
        vi.stubGlobal('fetch', fetchMock);

        const stream = Readable.from([Buffer.from('chunk')]);

        // Stream is single-use: the first 503 exhausts it, the retry can't
        // replay, and we throw the last recorded error.
        await expect(deepgramTranscribe(stream, 'audio/webm')).rejects.toThrow(
          /Deepgram API error 503|stream was already consumed/
        );

        vi.stubGlobal('setTimeout', originalSetTimeout);
      });
    });
  });
});
