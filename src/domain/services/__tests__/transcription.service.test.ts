import { Readable } from 'stream';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ScrapeJobItemStage, ScrapeStageMeta } from '@/domain/models';

const mocks = vi.hoisted(() => ({
  downloadYoutubeAudioStream: vi.fn(),
  deepgramTranscribe: vi.fn(),
  geminiTranscribeShort: vi.fn(),
}));

vi.mock('@/infrastructure/api/youtube-audio.client', () => ({
  downloadYoutubeAudioStream: mocks.downloadYoutubeAudioStream,
}));
vi.mock('@/infrastructure/api/deepgram.client', () => ({
  deepgramTranscribe: mocks.deepgramTranscribe,
}));
vi.mock('@/infrastructure/api/gemini.client', () => ({
  geminiTranscribeShort: mocks.geminiTranscribeShort,
}));

import { transcribeAudio } from '../transcription.service';

const URL = 'https://www.youtube.com/watch?v=abc';

function makeAudioStream(chunks: Buffer[] = [Buffer.from('audio-bytes')]) {
  return {
    stream: Readable.from(chunks),
    mimeType: 'audio/webm',
    durationSeconds: 600,
    format: 'webm',
    bytesTotal: chunks.reduce((acc, c) => acc + c.length, 0),
  };
}

describe('transcribeAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.downloadYoutubeAudioStream.mockImplementation(() => Promise.resolve(makeAudioStream()));
  });

  it('uses Deepgram as the primary path for long videos', async () => {
    mocks.deepgramTranscribe.mockImplementation(async (stream: Readable) => {
      // Drain the stream so the 'end' event fires for the byte counter
      // (mirrors how the real fetch body consumer behaves).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of stream) {
        // consume
      }
      return 'long video transcript';
    });

    const result = await transcribeAudio({
      sourceUrl: URL,
      isShort: false,
      maxDurationSeconds: 7200,
    });

    expect(result).toMatchObject({ text: 'long video transcript', source: 'deepgram' });
    expect(result.durationSeconds).toBe(600);
    expect(mocks.downloadYoutubeAudioStream).toHaveBeenCalledWith(URL, {
      maxDurationSeconds: 7200,
    });
    expect(mocks.deepgramTranscribe).toHaveBeenCalledOnce();
    expect(mocks.geminiTranscribeShort).not.toHaveBeenCalled();
  });

  it('uses Deepgram as the primary path for Shorts (not Gemini-first)', async () => {
    mocks.deepgramTranscribe.mockImplementation(async (stream: Readable) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of stream) {
        // consume
      }
      return 'short transcript';
    });

    const result = await transcribeAudio({
      sourceUrl: URL,
      isShort: true,
      maxDurationSeconds: 7200,
    });

    expect(result).toMatchObject({ text: 'short transcript', source: 'deepgram' });
    expect(mocks.geminiTranscribeShort).not.toHaveBeenCalled();
  });

  it('falls back to Gemini file_uri for Shorts when Deepgram fails', async () => {
    mocks.deepgramTranscribe.mockRejectedValue(new Error('Deepgram 503'));
    mocks.geminiTranscribeShort.mockResolvedValue('gemini transcript');

    const result = await transcribeAudio({
      sourceUrl: URL,
      isShort: true,
      maxDurationSeconds: 7200,
    });

    expect(result).toMatchObject({ text: 'gemini transcript', source: 'gemini' });
    expect(mocks.geminiTranscribeShort).toHaveBeenCalledWith(URL);
  });

  it('does NOT fall back to Gemini for long videos when Deepgram fails', async () => {
    mocks.deepgramTranscribe.mockRejectedValue(new Error('Deepgram 503'));

    await expect(
      transcribeAudio({ sourceUrl: URL, isShort: false, maxDurationSeconds: 7200 })
    ).rejects.toThrow('Deepgram 503');
    expect(mocks.geminiTranscribeShort).not.toHaveBeenCalled();
  });

  it('rethrows the Gemini error if both vendors fail for a Short', async () => {
    mocks.deepgramTranscribe.mockRejectedValue(new Error('Deepgram 503'));
    mocks.geminiTranscribeShort.mockRejectedValue(new Error('Gemini quota'));

    await expect(
      transcribeAudio({ sourceUrl: URL, isShort: true, maxDurationSeconds: 7200 })
    ).rejects.toThrow('Gemini quota');
  });

  describe('stage callbacks', () => {
    it('emits downloading → transcribing for the Deepgram primary path', async () => {
      mocks.deepgramTranscribe.mockImplementation(async (stream: Readable) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of stream) {
          // consume
        }
        return 'ok';
      });

      const calls: Array<{ stage: ScrapeJobItemStage; meta?: ScrapeStageMeta }> = [];
      await transcribeAudio({
        sourceUrl: URL,
        isShort: false,
        maxDurationSeconds: 7200,
        onStage: (stage, meta) => calls.push({ stage, meta }),
      });

      const stages = calls.map((c) => c.stage);
      expect(stages).toContain('downloading');
      expect(stages).toContain('transcribing');
      // downloading must precede transcribing
      expect(stages.indexOf('downloading')).toBeLessThan(stages.indexOf('transcribing'));
      // at least one downloading call carries bytesTotal
      expect(calls.find((c) => c.stage === 'downloading' && c.meta?.bytesTotal)).toBeTruthy();
    });

    it('emits transcribing on the Gemini failover path too', async () => {
      mocks.deepgramTranscribe.mockRejectedValue(new Error('Deepgram 503'));
      mocks.geminiTranscribeShort.mockResolvedValue('gemini transcript');

      const stages: ScrapeJobItemStage[] = [];
      await transcribeAudio({
        sourceUrl: URL,
        isShort: true,
        maxDurationSeconds: 7200,
        onStage: (stage) => stages.push(stage),
      });

      expect(stages).toContain('transcribing');
    });

    it('swallows errors thrown by the stage callback without breaking the pipeline', async () => {
      mocks.deepgramTranscribe.mockImplementation(async (stream: Readable) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of stream) {
          // consume
        }
        return 'ok';
      });

      const result = await transcribeAudio({
        sourceUrl: URL,
        isShort: false,
        maxDurationSeconds: 7200,
        onStage: () => {
          throw new Error('callback boom');
        },
      });

      expect(result.text).toBe('ok');
    });
  });
});
