import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadYoutubeAudio: vi.fn(),
  deepgramTranscribe: vi.fn(),
  geminiTranscribeShort: vi.fn(),
}));

vi.mock('@/infrastructure/api/youtube-audio.client', () => ({
  downloadYoutubeAudio: mocks.downloadYoutubeAudio,
}));
vi.mock('@/infrastructure/api/deepgram.client', () => ({
  deepgramTranscribe: mocks.deepgramTranscribe,
}));
vi.mock('@/infrastructure/api/gemini.client', () => ({
  geminiTranscribeShort: mocks.geminiTranscribeShort,
}));

import { transcribeAudio } from '../transcription.service';

const URL = 'https://www.youtube.com/watch?v=abc';

describe('transcribeAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.downloadYoutubeAudio.mockResolvedValue({
      buffer: Buffer.from(''),
      mimeType: 'audio/mp4',
    });
  });

  it('uses Deepgram as the primary path for long videos', async () => {
    mocks.deepgramTranscribe.mockResolvedValue('long video transcript');

    const result = await transcribeAudio({
      sourceUrl: URL,
      isShort: false,
      maxDurationSeconds: 7200,
    });

    expect(result).toEqual({ text: 'long video transcript', source: 'deepgram' });
    expect(mocks.downloadYoutubeAudio).toHaveBeenCalledWith(URL, { maxDurationSeconds: 7200 });
    expect(mocks.deepgramTranscribe).toHaveBeenCalledOnce();
    expect(mocks.geminiTranscribeShort).not.toHaveBeenCalled();
  });

  it('uses Deepgram as the primary path for Shorts (not Gemini-first)', async () => {
    mocks.deepgramTranscribe.mockResolvedValue('short transcript');

    const result = await transcribeAudio({
      sourceUrl: URL,
      isShort: true,
      maxDurationSeconds: 7200,
    });

    expect(result).toEqual({ text: 'short transcript', source: 'deepgram' });
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

    expect(result).toEqual({ text: 'gemini transcript', source: 'gemini' });
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
});
