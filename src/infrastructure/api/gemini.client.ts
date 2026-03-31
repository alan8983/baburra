/**
 * Google Gemini AI API 客戶端
 * @see https://ai.google.dev/gemini-api/docs
 */

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
      role: string;
    };
    finishReason: string;
    index: number;
  }[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface GeminiGenerateOptions {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = process.env.AI_SENTIMENT_MODEL || 'gemini-2.5-flash-lite';
const TRANSCRIPTION_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 30_000;
const TRANSCRIPTION_TIMEOUT_MS = 180_000; // Floor for short/unknown videos
const MAX_TRANSCRIPTION_TIMEOUT_MS = 600_000; // Cap at 10 minutes
const MAX_VIDEO_DURATION_SECONDS = 120 * 60; // 120 minutes
const RETRY_DELAYS = [5_000, 15_000]; // Backoff delays for retries

/** Return the currently configured AI model name (for version tracking). */
export function getAiModelVersion(): string {
  return DEFAULT_MODEL;
}

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  return apiKey;
}

/**
 * 使用 Gemini API 生成文字回應
 */
export async function generateContent(
  prompt: string,
  options?: GeminiGenerateOptions,
  model: string = DEFAULT_MODEL
): Promise<string> {
  const apiKey = getApiKey();

  const url = `${GEMINI_BASE}/models/${model}:generateContent`;

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: options?.temperature ?? 0.7,
      topK: options?.topK ?? 40,
      topP: options?.topP ?? 0.95,
      maxOutputTokens: options?.maxOutputTokens ?? 2048,
      stopSequences: options?.stopSequences,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errorText || res.statusText}`);
    }

    const data = (await res.json()) as GeminiResponse;

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('Gemini API returned no candidates');
    }

    const candidate = data.candidates[0];
    if (!candidate.content?.parts || candidate.content.parts.length === 0) {
      throw new Error('Gemini API returned empty content');
    }

    return candidate.content.parts.map((p) => p.text).join('');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Gemini API request timed out after ${DEFAULT_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 使用 Gemini 結構化輸出生成 JSON — 透過 responseSchema 保證格式正確
 * @see https://ai.google.dev/gemini-api/docs/structured-output
 */
export async function generateStructuredJson<T>(
  prompt: string,
  schema: Record<string, unknown>,
  options?: GeminiGenerateOptions,
  model: string = DEFAULT_MODEL
): Promise<T> {
  const apiKey = getApiKey();

  const url = `${GEMINI_BASE}/models/${model}:generateContent`;

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: options?.temperature ?? 0.7,
      topK: options?.topK ?? 40,
      topP: options?.topP ?? 0.95,
      maxOutputTokens: options?.maxOutputTokens ?? 2048,
      stopSequences: options?.stopSequences,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errorText || res.statusText}`);
    }

    const data = (await res.json()) as GeminiResponse;

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('Gemini API returned no candidates');
    }

    const candidate = data.candidates[0];
    if (!candidate.content?.parts || candidate.content.parts.length === 0) {
      throw new Error('Gemini API returned empty content');
    }

    const text = candidate.content.parts.map((p) => p.text).join('');
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Gemini API request timed out after ${DEFAULT_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 生成 JSON 回應並解析
 * 會自動清理回應中的 markdown 標記
 */
export async function generateJson<T>(
  prompt: string,
  options?: GeminiGenerateOptions,
  model: string = DEFAULT_MODEL
): Promise<T> {
  const text = await generateContent(prompt, options, model);

  // 清理可能的 markdown code block 標記
  let cleanedText = text.trim();

  // 移除 ```json ... ``` 包裝
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.slice(7);
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.slice(3);
  }

  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.slice(0, -3);
  }

  cleanedText = cleanedText.trim();

  try {
    return JSON.parse(cleanedText) as T;
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${cleanedText.slice(0, 200)}...`);
  }
}

/**
 * Check if an error is retryable (transient failures that may succeed on retry).
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Timeout (AbortError)
    if (error.name === 'AbortError') return true;
    // Network errors (fetch failed, connection reset, etc.)
    if (error instanceof TypeError && error.message.includes('fetch failed')) return true;
    // Socket errors from undici (stale connection after large file upload)
    // See: https://github.com/nodejs/undici/issues/3492
    if (error.name === 'SocketError') return true;
    if (/ECONNRESET|socket hang up|other side closed/.test(error.message)) return true;
    // HTTP 429/500/503 encoded in error message
    if (/API error (429|500|503)/.test(error.message)) return true;
  }
  return false;
}

/**
 * Compute dynamic timeout based on video duration.
 * Longer videos need more time for Gemini to download and process.
 * Formula: max(180s, min(600s, 60s + duration × 4s))
 */
function getTranscriptionTimeout(durationSeconds?: number): number {
  if (!durationSeconds) return TRANSCRIPTION_TIMEOUT_MS;
  return Math.max(
    TRANSCRIPTION_TIMEOUT_MS,
    Math.min(MAX_TRANSCRIPTION_TIMEOUT_MS, 60_000 + durationSeconds * 4_000)
  );
}

/**
 * Compute dynamic maxOutputTokens based on video duration.
 * Longer videos produce longer transcripts.
 * Formula: min(65536, max(16384, durationMinutes × 1000))
 */
function getMaxOutputTokens(durationSeconds?: number): number {
  if (!durationSeconds) return 16_384;
  const durationMinutes = Math.ceil(durationSeconds / 60);
  return Math.min(65_536, Math.max(16_384, durationMinutes * 1_000));
}

/**
 * Transcribe a YouTube video using Gemini multimodal (video + audio understanding).
 * Uses gemini-2.5-flash (not flash-lite) for better audio quality.
 * Videos >45 minutes are rejected.
 *
 * Features:
 * - Dynamic timeout scaling based on video duration (180s–600s)
 * - Retry with exponential backoff for transient errors (up to 2 retries)
 * - Dynamic maxOutputTokens scaling for long videos (16K–65K)
 *
 * @param youtubeUrl - Full YouTube video URL
 * @param durationSeconds - Optional video duration for validation and scaling
 * @returns Transcript text in the video's original language
 */
export async function geminiTranscribeVideo(
  youtubeUrl: string,
  durationSeconds?: number
): Promise<string> {
  if (durationSeconds && durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
    throw new Error(
      `Video too long (${Math.ceil(durationSeconds / 60)} min). Maximum is ${Math.ceil(MAX_VIDEO_DURATION_SECONDS / 60)} minutes.`
    );
  }

  const apiKey = getApiKey();
  const url = `${GEMINI_BASE}/models/${TRANSCRIPTION_MODEL}:generateContent`;
  const timeoutMs = getTranscriptionTimeout(durationSeconds);
  const maxOutputTokens = getMaxOutputTokens(durationSeconds);
  const durationMin = durationSeconds ? Math.ceil(durationSeconds / 60) : undefined;

  console.log(
    `[Gemini] Transcribing video: ${youtubeUrl} | duration=${durationMin ?? '?'}min | timeout=${timeoutMs / 1000}s | maxTokens=${maxOutputTokens}`
  );

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: 'Transcribe the spoken content of this video in its original language. Output only the transcript text, no timestamps or speaker labels.',
          },
          {
            file_data: {
              file_uri: youtubeUrl,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens,
      mediaResolution: 'MEDIA_RESOLUTION_LOW',
    },
  };

  // Attempt with retries
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        const statusError = new Error(
          `Gemini transcription API error ${res.status}: ${errorText || res.statusText}`
        );

        // Non-retryable HTTP errors — fail immediately
        if (res.status === 400 || res.status === 403) {
          throw statusError;
        }

        if (res.status === 429) {
          console.warn(
            `[Gemini] Rate limit (429) hit for ${youtubeUrl}. Will retry if attempts remain.`
          );
        }

        throw statusError;
      }

      const data = (await res.json()) as GeminiResponse;

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('Gemini transcription returned no candidates');
      }

      const candidate = data.candidates[0];
      if (!candidate.content?.parts || candidate.content.parts.length === 0) {
        throw new Error('Gemini transcription returned empty content');
      }

      const transcript = candidate.content.parts.map((p) => p.text).join('');
      if (!transcript.trim()) {
        throw new Error('Gemini transcription returned empty transcript');
      }

      if (attempt > 0) {
        console.log(`[Gemini] Transcription succeeded on attempt ${attempt + 1} for ${youtubeUrl}`);
      }

      return transcript;
    } catch (error) {
      clearTimeout(timeoutId);

      // Convert AbortError to a descriptive error
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(
          `Video transcription timed out after ${timeoutMs / 1000}s` +
            (durationMin
              ? ` for a ${durationMin}-min video. Try a shorter video or retry later.`
              : '.')
        );
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      // Check if we should retry
      const canRetry = attempt < RETRY_DELAYS.length && isRetryableError(error);
      if (!canRetry) {
        // Log final failure details
        console.error('[Gemini] Video transcription failed (no more retries):', {
          name: lastError.name,
          message: lastError.message,
          attempt: attempt + 1,
          youtubeUrl,
          durationMin,
          timeoutMs,
        });
        throw lastError;
      }

      // Wait before retrying
      const delay = RETRY_DELAYS[attempt];
      console.warn(
        `[Gemini] Transcription attempt ${attempt + 1} failed for ${youtubeUrl}: ${lastError.message}. Retrying in ${delay / 1000}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));

      continue;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Should not reach here, but safety net
  throw lastError ?? new Error('Gemini transcription failed after all retries');
}
