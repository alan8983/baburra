/**
 * Deepgram Speech-to-Text Client
 *
 * Transcribes audio using Deepgram Nova-3 REST API.
 * Used for all captionless YouTube videos via audio download.
 *
 * Single fetch() POST — no SDK dependency.
 * Accepts either a pre-buffered `Buffer` or a Node `Readable` stream as the
 * request body. The streaming path lets the download and transcription stages
 * overlap: ytdl-core emits audio bytes while the same bytes are being POSTed
 * to Deepgram with `duplex: 'half'`.
 *
 * Includes retry logic with exponential backoff for transient errors.
 *
 * @see https://developers.deepgram.com/reference/listen-file
 */

import { Readable } from 'stream';
import type { DeepgramCallMeta } from '@/domain/models/pipeline-timing';

const DEEPGRAM_BASE = 'https://api.deepgram.com/v1/listen';
const REQUEST_TIMEOUT_MS = 180_000; // 3 min

// Retry delays scale off a base. Default base 5 000 ms → [5 s, 15 s].
// Override with DEEPGRAM_RETRY_BASE_MS env var (e.g. tuning loops in §6).
function getRetryDelays(): number[] {
  const base = Number(process.env.DEEPGRAM_RETRY_BASE_MS) || 5_000;
  return [base, base * 3];
}

function getApiKey(): string {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY is not set');
  }
  return apiKey;
}

function isStreamingEnabled(): boolean {
  // Default-on; set DEEPGRAM_STREAMING_BODY=false to force the buffered path.
  return (process.env.DEEPGRAM_STREAMING_BODY ?? 'true').toLowerCase() !== 'false';
}

interface DeepgramUtterance {
  speaker: number;
  start: number;
  end: number;
  transcript: string;
}

interface DeepgramResponse {
  results?: {
    utterances?: DeepgramUtterance[];
    channels?: {
      alternatives?: {
        transcript?: string;
      }[];
    }[];
  };
}

/**
 * Check if an error is retryable (transient failures that may succeed on retry).
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true;
    if (error instanceof TypeError && error.message.includes('fetch failed')) return true;
    if (error.name === 'SocketError') return true;
    if (/ECONNRESET|socket hang up|other side closed/.test(error.message)) return true;
    if (/API error (429|503)/.test(error.message)) return true;
  }
  return false;
}

/**
 * Check if an error is non-retryable (client errors that won't succeed on retry).
 */
function isNonRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    if (/API error (400|401|403)/.test(error.message)) return true;
  }
  return false;
}

/**
 * Format seconds as HH:MM:SS.
 */
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Extract actual duration in seconds from a formatted Deepgram transcript.
 * Parses the last utterance's timestamp to determine the real duration.
 *
 * @param transcript - Formatted transcript with `[Speaker N, HH:MM:SS]` lines
 * @returns Duration in seconds, or null if no timestamps found
 */
export function extractActualDuration(transcript: string): number | null {
  const timestampRegex = /\[Speaker \d+, (\d{2}):(\d{2}):(\d{2})\]/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = timestampRegex.exec(transcript)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) return null;

  const hours = parseInt(lastMatch[1], 10);
  const minutes = parseInt(lastMatch[2], 10);
  const seconds = parseInt(lastMatch[3], 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format Deepgram utterances into structured text with speaker labels and timestamps.
 *
 * Output format:
 * ```
 * [Speaker 0, 00:01:23] First utterance text here...
 * [Speaker 1, 00:02:45] Second utterance from different speaker...
 * ```
 */
export function formatTranscript(utterances: DeepgramUtterance[]): string {
  return utterances
    .map((u) => `[Speaker ${u.speaker}, ${formatTimestamp(u.start)}] ${u.transcript}`)
    .join('\n');
}

async function drainStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Transcribe audio using Deepgram Nova-3.
 *
 * Sends audio data as a single POST request. Returns a formatted transcript
 * with speaker labels and timestamps.
 *
 * `body` may be a `Buffer` (pre-downloaded audio) or a Node `Readable` stream
 * (for the streaming download→transcribe overlap path). Streams are consumed
 * once; if a streaming attempt fails with a retryable error, the retry falls
 * back to the buffered path for that attempt.
 *
 * Includes retry logic: up to 2 retries with 5s/15s exponential backoff
 * for transient errors (503, 429, network, timeout). Non-retryable errors
 * (400, 401, 403) fail immediately.
 *
 * @param body - Audio data as Buffer or Readable stream
 * @param mimeType - MIME type (e.g., 'audio/webm', 'audio/mp4')
 * @returns Formatted transcript string
 */
export async function deepgramTranscribe(
  body: Buffer | Readable,
  mimeType: string,
  meta?: DeepgramCallMeta
): Promise<string> {
  const apiKey = getApiKey();
  let retries = 0;

  const params = new URLSearchParams({
    model: 'nova-3',
    detect_language: 'true',
    smart_format: 'true',
    paragraphs: 'true',
    diarize: 'true',
    utterances: 'true',
  });

  const url = `${DEEPGRAM_BASE}?${params.toString()}`;

  // Streams are single-use. If the caller passed a stream but streaming is
  // disabled (or streaming fails on a retry), we drain it into a buffer first
  // and reuse the buffer across retries.
  let bufferedBody: Buffer | null = Buffer.isBuffer(body) ? body : null;
  let streamConsumed = false;
  const streamingEnabled = isStreamingEnabled();

  if (bufferedBody === null && !streamingEnabled) {
    // body must be a Readable here — we already handled the Buffer case above.
    bufferedBody = await drainStreamToBuffer(body as Readable);
    streamConsumed = true;
  }

  const logSize = bufferedBody
    ? `${(bufferedBody.length / 1024 / 1024).toFixed(1)} MB`
    : 'streaming';
  console.log(`[Deepgram] Transcribing audio: ${logSize}, ${mimeType}`);

  let lastError: Error | undefined;
  const retryDelays = getRetryDelays();

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    // Decide the request body for this attempt.
    // - If we already have a buffer, reuse it.
    // - If this is the first attempt and we have a live stream, use it directly.
    // - If we have a live stream but it was already consumed by a previous
    //   attempt, we can't retry — there's nothing left. Fail definitively.
    let requestBody: BodyInit;
    let usingStream = false;
    // `duplex` is a Node-specific RequestInit option for streaming bodies.
    // It isn't part of the public RequestInit type yet but is required by
    // undici/fetch when the body is a ReadableStream.
    let requestInit: RequestInit & { duplex?: 'half' };
    if (bufferedBody) {
      requestBody = new Uint8Array(bufferedBody);
      requestInit = {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': mimeType,
        },
        body: requestBody,
        signal: controller.signal,
      };
    } else {
      if (streamConsumed) {
        // A prior attempt drained the stream and failed before we could
        // buffer it. No way to retry.
        clearTimeout(timeoutId);
        throw (
          lastError ??
          new Error('Deepgram streaming attempt failed and the source stream was already consumed')
        );
      }
      usingStream = true;
      streamConsumed = true;
      const nodeStream = body as Readable;
      // Node's undici fetch accepts a web ReadableStream; convert from the
      // Node Readable we got from ytdl-core.
      const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
      requestInit = {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': mimeType,
        },
        body: webStream,
        signal: controller.signal,
        duplex: 'half',
      };
    }

    try {
      const res = await fetch(url, requestInit);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Deepgram API error ${res.status}: ${errorText || res.statusText}`);
      }

      const data = (await res.json()) as DeepgramResponse;

      // Prefer utterances (has speaker + timing); fall back to plain transcript
      if (data.results?.utterances && data.results.utterances.length > 0) {
        const transcript = formatTranscript(data.results.utterances);
        if (attempt > 0) {
          console.log(`[Deepgram] Transcription succeeded on attempt ${attempt + 1}`);
        }
        console.log(
          `[Deepgram] Transcription complete: ${data.results.utterances.length} utterances`
        );
        if (meta) meta.retries = retries;
        return transcript;
      }

      // Fallback: plain transcript from first channel
      const plainTranscript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      if (plainTranscript?.trim()) {
        console.log('[Deepgram] Transcription complete (plain text fallback)');
        if (meta) meta.retries = retries;
        return plainTranscript;
      }

      throw new Error('Deepgram returned no transcript');
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(
          `Deepgram transcription timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        );
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      // Non-retryable errors fail immediately
      if (isNonRetryableError(lastError)) {
        throw lastError;
      }

      // If the streaming attempt failed, we can't retry with the same
      // stream — it's already consumed. We also don't have a buffered copy.
      // Fall through to the retry loop, which will throw on the next iteration
      // because `streamConsumed === true && bufferedBody === null`.
      if (usingStream && bufferedBody === null) {
        // Emit a clearer log line so this case is easy to diagnose in prod.
        console.warn(
          '[Deepgram] Streaming attempt failed; source stream is exhausted, no retry possible'
        );
      }

      // Check if we should retry
      const canRetry = attempt < retryDelays.length && isRetryableError(error);
      if (!canRetry) {
        console.error('[Deepgram] Transcription failed (no more retries):', {
          message: lastError.message,
          attempt: attempt + 1,
        });
        throw lastError;
      }

      const delay = retryDelays[attempt];
      console.warn(
        `[Deepgram] Attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay / 1000}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      retries++;
      continue;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (meta) meta.retries = retries;
  throw lastError ?? new Error('Deepgram transcription failed after all retries');
}
