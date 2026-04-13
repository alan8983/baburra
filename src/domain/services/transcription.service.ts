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
 *
 * Streaming & stage progress:
 *   The Deepgram primary path uses `downloadYoutubeAudioStream` +
 *   `deepgramTranscribe(stream)` so the download and transcription
 *   stages overlap. Callers may pass an `onStage` callback to receive
 *   `downloading` (with byte progress) and `transcribing` transitions.
 */

import { Transform, type Readable } from 'stream';
import { downloadYoutubeAudioStream } from '@/infrastructure/api/youtube-audio.client';
import { deepgramTranscribe } from '@/infrastructure/api/deepgram.client';
import { geminiTranscribeShort } from '@/infrastructure/api/gemini.client';
import type { ScrapeJobItemStage, ScrapeStageMeta } from '@/domain/models';

export type StageCallback = (stage: ScrapeJobItemStage, meta?: ScrapeStageMeta) => void;

export interface TranscribeAudioInput {
  /** Source URL of the audio (currently always a YouTube URL). */
  sourceUrl: string;
  /** True iff the clip is a YouTube Short (≤60s). Enables Gemini failover. */
  isShort: boolean;
  /** Max duration safety guard passed to the audio downloader. */
  maxDurationSeconds: number;
  /**
   * Optional stage callback. When provided, the service emits:
   *   - `downloading` with `{ bytesTotal }` at start and periodic
   *     `{ bytesDownloaded }` updates (throttled to ~1 MB)
   *   - `transcribing` once the audio stream has been fully consumed
   */
  onStage?: StageCallback;
}

/** Sub-step timing returned alongside the transcript. */
export interface TranscriptionTimings {
  downloadMs: number;
  transcribeMs: number;
  totalMs: number;
}

export interface TranscribeAudioResult {
  text: string;
  /** Which vendor produced the transcript. For audit/cache provenance only. */
  source: 'deepgram' | 'gemini';
  /** Duration from the downloader, if known (used for credit reconciliation). */
  durationSeconds?: number;
  /** Sub-step timing breakdown (download vs transcribe). */
  timings?: TranscriptionTimings;
}

// Safely invoke a stage callback — never let a throwing callback break the
// transcription pipeline.
function safeEmit(
  onStage: StageCallback | undefined,
  stage: ScrapeJobItemStage,
  meta?: ScrapeStageMeta
): void {
  if (!onStage) return;
  try {
    onStage(stage, meta);
  } catch (err) {
    console.warn('[transcribeAudio] stage callback threw:', err);
  }
}

/**
 * Wrap a Readable stream in a byte-counting Transform. Fires `onProgress`
 * with the running byte total at ~1 MB intervals and once more on flush.
 * The returned stream forwards all data unchanged.
 */
function wrapWithByteCounter(
  source: Readable,
  onProgress: (bytesDownloaded: number) => void,
  minIntervalBytes = 1_000_000
): Readable {
  let total = 0;
  let lastReported = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      total += chunk.length;
      if (total - lastReported >= minIntervalBytes) {
        lastReported = total;
        try {
          onProgress(total);
        } catch (err) {
          console.warn('[transcribeAudio] progress callback threw:', err);
        }
      }
      callback(null, chunk);
    },
    flush(callback) {
      try {
        onProgress(total);
      } catch (err) {
        console.warn('[transcribeAudio] flush progress callback threw:', err);
      }
      callback();
    },
  });
  return source.pipe(counter);
}

export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  const { sourceUrl, isShort, maxDurationSeconds, onStage } = input;

  // Primary: Deepgram via streaming audio download. Download and transcription
  // stages overlap — the Readable is consumed by fetch() with duplex: 'half'.
  const _tTotal = Date.now();
  try {
    console.log(
      `[transcribeAudio] Primary path: Deepgram (${isShort ? 'Short' : 'long video'}) ${sourceUrl}`
    );

    const _tDl = Date.now();
    const audio = await downloadYoutubeAudioStream(sourceUrl, { maxDurationSeconds });
    safeEmit(onStage, 'downloading', {
      bytesTotal: audio.bytesTotal,
      durationSeconds: audio.durationSeconds,
    });

    let transcribingEmitted = false;
    const counting = wrapWithByteCounter(audio.stream, (bytesDownloaded) => {
      safeEmit(onStage, 'downloading', {
        bytesDownloaded,
        bytesTotal: audio.bytesTotal,
      });
    });
    // When the source stream ends we've shipped every byte to Deepgram —
    // the pipeline is no longer "downloading", it's "transcribing" while we
    // wait for Deepgram to finish processing and respond.
    let _tDlEnd = 0;
    audio.stream.once('end', () => {
      _tDlEnd = Date.now();
      if (!transcribingEmitted) {
        transcribingEmitted = true;
        safeEmit(onStage, 'transcribing', { durationSeconds: audio.durationSeconds });
      }
    });

    const text = await deepgramTranscribe(counting, audio.mimeType);
    const _tDone = Date.now();
    // Defensive: ensure we don't leave the UI stuck in `downloading` if the
    // stream finished without an `end` event reaching us (very rare).
    if (!transcribingEmitted) {
      safeEmit(onStage, 'transcribing', { durationSeconds: audio.durationSeconds });
    }
    const downloadMs = (_tDlEnd || _tDone) - _tDl;
    const transcribeMs = _tDlEnd ? _tDone - _tDlEnd : 0;
    return {
      text,
      source: 'deepgram',
      durationSeconds: audio.durationSeconds,
      timings: { downloadMs, transcribeMs, totalMs: _tDone - _tTotal },
    };
  } catch (deepgramErr) {
    const errMsg = deepgramErr instanceof Error ? deepgramErr.message : String(deepgramErr);

    // Failover: Gemini file_uri — only viable for Shorts.
    if (isShort) {
      console.warn(
        `[transcribeAudio] Deepgram failed for Short, failing over to Gemini file_uri: ${errMsg}`
      );
      try {
        safeEmit(onStage, 'transcribing');
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
