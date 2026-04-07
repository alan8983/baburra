/**
 * Transcription Service — single user-facing transcription entry point.
 *
 * Per the lego credit model, all captionless audio routes through one
 * `transcribe.audio` block regardless of which vendor actually ran. This
 * service hides vendor selection from the import pipeline:
 *
 *  1. Deepgram is the **primary** vendor — predictable per-minute cost,
 *     consistently cheaper than Gemini audio for anything ≥2–3 minutes,
 *     and the simpler routing.
 *  2. Gemini audio (`geminiTranscribeShort`, file_uri based) is a
 *     **failover-only** path used when Deepgram fails AND the clip is a
 *     YouTube Short. Long-video failover is not supported because Gemini
 *     audio is unreliable for that length and there's no analogous
 *     long-video file_uri path today.
 *
 * Callers ALWAYS pay the same `transcribe.audio` charge regardless of
 * which vendor returned the transcript.
 */

import { downloadYoutubeAudio } from '@/infrastructure/api/youtube-audio.client';
import { deepgramTranscribe } from '@/infrastructure/api/deepgram.client';
import { geminiTranscribeShort } from '@/infrastructure/api/gemini.client';

export interface TranscribeAudioInput {
  /** Source URL of the audio (currently always a YouTube URL). */
  sourceUrl: string;
  /** True iff the clip is a YouTube Short (≤60s). Enables Gemini failover. */
  isShort: boolean;
  /** Max duration safety guard passed to the audio downloader. */
  maxDurationSeconds: number;
}

export interface TranscribeAudioResult {
  text: string;
  /** Which vendor produced the transcript. For audit/cache provenance only. */
  source: 'deepgram' | 'gemini';
}

export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  const { sourceUrl, isShort, maxDurationSeconds } = input;

  // Primary: Deepgram via downloaded audio.
  try {
    console.log(
      `[transcribeAudio] Primary path: Deepgram (${isShort ? 'Short' : 'long video'}) ${sourceUrl}`
    );
    const audio = await downloadYoutubeAudio(sourceUrl, { maxDurationSeconds });
    const text = await deepgramTranscribe(audio.buffer, audio.mimeType);
    return { text, source: 'deepgram' };
  } catch (deepgramErr) {
    const errMsg = deepgramErr instanceof Error ? deepgramErr.message : String(deepgramErr);

    // Failover: Gemini file_uri — only viable for Shorts.
    if (isShort) {
      console.warn(
        `[transcribeAudio] Deepgram failed for Short, failing over to Gemini file_uri: ${errMsg}`
      );
      try {
        const text = await geminiTranscribeShort(sourceUrl);
        return { text, source: 'gemini' };
      } catch (geminiErr) {
        console.error(
          `[transcribeAudio] Gemini failover also failed for ${sourceUrl}: ${
            geminiErr instanceof Error ? geminiErr.message : String(geminiErr)
          }`
        );
        throw geminiErr;
      }
    }

    // Long video: no failover available.
    console.error(`[transcribeAudio] Deepgram failed for long video ${sourceUrl}: ${errMsg}`);
    throw deepgramErr;
  }
}
