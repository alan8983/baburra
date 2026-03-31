import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deepgramTranscribe, formatTranscript } from '../deepgram.client';

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

    it('throws on Deepgram API error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: () => Promise.resolve('Invalid audio format'),
        })
      );

      await expect(deepgramTranscribe(Buffer.from('bad'), 'audio/webm')).rejects.toThrow(
        'Deepgram API error 400: Invalid audio format'
      );
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
  });
});
