/**
 * Deepgram Speech-to-Text Client
 *
 * Transcribes audio using Deepgram Nova-2 REST API.
 * Used for long videos (>30 min) where Gemini's direct file_uri approach
 * is impractical due to server-side socket bugs.
 *
 * Single fetch() POST — no SDK dependency.
 *
 * @see https://developers.deepgram.com/reference/listen-file
 */

const DEEPGRAM_BASE = 'https://api.deepgram.com/v1/listen';
const REQUEST_TIMEOUT_MS = 180_000; // 3 min

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
 * Format seconds as HH:MM:SS.
 */
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
 * Transcribe audio using Deepgram Nova-2.
 *
 * Sends audio data as a single POST request. Returns a formatted transcript
 * with speaker labels and timestamps.
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
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Deepgram transcription timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
