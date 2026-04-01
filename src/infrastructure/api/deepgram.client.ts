/**
 * Deepgram Speech-to-Text Client
 *
 * Transcribes audio using Deepgram Nova-3 REST API.
 * Used for all captionless YouTube videos via audio download.
 *
 * Single fetch() POST — no SDK dependency.
 * Includes retry logic with exponential backoff for transient errors.
 *
 * @see https://developers.deepgram.com/reference/listen-file
 */

const DEEPGRAM_BASE = 'https://api.deepgram.com/v1/listen';
const REQUEST_TIMEOUT_MS = 180_000; // 3 min
const RETRY_DELAYS = [5_000, 15_000]; // Backoff delays for retries

function getApiKey(): string {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY is not set');
  }
  return apiKey;
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

/**
 * Transcribe audio using Deepgram Nova-3.
 *
 * Sends audio data as a single POST request. Returns a formatted transcript
 * with speaker labels and timestamps.
 *
 * Includes retry logic: up to 2 retries with 5s/15s exponential backoff
 * for transient errors (503, 429, network, timeout). Non-retryable errors
 * (400, 401, 403) fail immediately.
 *
 * @param buffer - Audio data as Buffer
 * @param mimeType - MIME type (e.g., 'audio/webm', 'audio/mp4')
 * @returns Formatted transcript string
 */
export async function deepgramTranscribe(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = getApiKey();

  const params = new URLSearchParams({
    model: 'nova-3',
    detect_language: 'true',
    smart_format: 'true',
    paragraphs: 'true',
    diarize: 'true',
    utterances: 'true',
  });

  const url = `${DEEPGRAM_BASE}?${params.toString()}`;

  console.log(
    `[Deepgram] Transcribing audio: ${(buffer.length / 1024 / 1024).toFixed(1)} MB, ${mimeType}`
  );

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': mimeType,
        },
        body: new Uint8Array(buffer),
        signal: controller.signal,
      });

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
        return transcript;
      }

      // Fallback: plain transcript from first channel
      const plainTranscript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      if (plainTranscript?.trim()) {
        console.log('[Deepgram] Transcription complete (plain text fallback)');
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

      // Check if we should retry
      const canRetry = attempt < RETRY_DELAYS.length && isRetryableError(error);
      if (!canRetry) {
        console.error('[Deepgram] Transcription failed (no more retries):', {
          message: lastError.message,
          attempt: attempt + 1,
        });
        throw lastError;
      }

      const delay = RETRY_DELAYS[attempt];
      console.warn(
        `[Deepgram] Attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay / 1000}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error('Deepgram transcription failed after all retries');
}
