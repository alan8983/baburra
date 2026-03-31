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

/**
 * Make a POST request using undici.request() with reset: true.
 *
 * After uploading large files via fetch(), Node.js's connection pool can enter
 * a stale state where subsequent fetch() calls to the same host fail with
 * "SocketError: other side closed" (bytesRead: 0). Using undici.request()
 * with reset: true forces a fresh TCP connection, avoiding this issue.
 *
 * @see https://github.com/nodejs/undici/issues/3492
 */
async function childProcessPost(
  requestUrl: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ statusCode: number; body: string }> {
  // Spawn a fresh Node.js child process for the HTTP request.
  //
  // After uploading large files (~46 MB) to generativelanguage.googleapis.com,
  // the parent process's network stack (both undici/fetch AND native https)
  // enters a broken state where ALL subsequent connections to Google fail with
  // "socket hang up" or "SocketError: other side closed".
  //
  // A child process has its own TCP connection pool and DNS cache, completely
  // isolated from the parent, which reliably avoids this issue.
  // Spike scripts (standalone Node.js) always succeeded — confirming that
  // process isolation is the fix.
  const { spawn } = await import('child_process');
  const { writeFileSync, unlinkSync } = await import('fs');
  const { join } = await import('path');
  const { tmpdir } = await import('os');

  // Write request body to temp file to avoid shell arg length limits
  const tmpBodyFile = join(tmpdir(), `gemini-req-${Date.now()}.json`);
  writeFileSync(tmpBodyFile, body, 'utf-8');

  // Inline script passed via -e flag
  const script = [
    'const https=require("https"),fs=require("fs");',
    `const url=new URL(${JSON.stringify(requestUrl)});`,
    `const body=fs.readFileSync(${JSON.stringify(tmpBodyFile)},"utf-8");`,
    `const hdrs=${JSON.stringify({ ...headers, 'Content-Length': String(Buffer.byteLength(body)) })};`,
    'const req=https.request({',
    '  hostname:url.hostname,path:url.pathname+url.search,',
    `  method:"POST",headers:hdrs,timeout:${timeoutMs}`,
    '},res=>{',
    '  let d="";res.on("data",c=>d+=c);',
    '  res.on("end",()=>{process.stdout.write(JSON.stringify({s:res.statusCode,b:d}))});',
    '});',
    'req.on("error",e=>{process.stderr.write(e.message);process.exit(1)});',
    'req.on("timeout",()=>{req.destroy();process.stderr.write("timeout");process.exit(1)});',
    'req.write(body);req.end();',
  ].join('');

  return new Promise((resolve, reject) => {
    const child = spawn('node', ['-e', script], {
      timeout: timeoutMs + 10_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

    child.on('close', (code) => {
      // Clean up temp file
      try {
        unlinkSync(tmpBodyFile);
      } catch {
        /* ignore */
      }

      if (code !== 0) {
        reject(new Error(`Child process exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { s: number; b: string };
        resolve({ statusCode: parsed.s, body: parsed.b });
      } catch {
        reject(new Error(`Failed to parse child process output: ${stdout.slice(0, 200)}`));
      }
    });

    child.on('error', (err) => {
      try {
        unlinkSync(tmpBodyFile);
      } catch {
        /* ignore */
      }
      reject(err);
    });
  });
}

/**
 * Transcribe audio via Gemini File API upload.
 * Used for long videos (>30 min) where the direct YouTube URL approach fails.
 *
 * Unlike geminiTranscribeVideo(), this accepts a Gemini-hosted file_uri
 * (from uploadToGeminiFiles) rather than a YouTube URL.
 * Audio-only = no video tokens, only audio tokens (~32/sec).
 *
 * Uses undici.request() with reset: true instead of fetch() to avoid
 * stale socket issues after large file uploads to the same Google host.
 *
 * Features:
 * - Dynamic maxOutputTokens scaling for long audio (16K–65K)
 * - Retry with exponential backoff for transient errors (up to 2 retries)
 * - No mediaResolution config needed (audio-only)
 *
 * @param fileUri - Gemini-hosted file URI (from File API upload)
 * @param durationSeconds - Audio duration for timeout and token scaling
 * @returns Transcript text in the audio's original language
 */
export async function geminiTranscribeAudio(
  fileUri: string,
  durationSeconds?: number
): Promise<string> {
  const apiKey = getApiKey();
  const requestUrl = `${GEMINI_BASE}/models/${TRANSCRIPTION_MODEL}:generateContent?key=${apiKey}`;
  const timeoutMs = getTranscriptionTimeout(durationSeconds);
  const maxOutputTokens = getMaxOutputTokens(durationSeconds);
  const durationMin = durationSeconds ? Math.ceil(durationSeconds / 60) : undefined;

  console.log(
    `[Gemini] Transcribing audio: ${fileUri} | duration=${durationMin ?? '?'}min | timeout=${timeoutMs / 1000}s | maxTokens=${maxOutputTokens}`
  );

  const bodyJson = JSON.stringify({
    contents: [
      {
        parts: [
          {
            text: 'Transcribe the spoken content of this audio in its original language. Output only the transcript text, no timestamps or speaker labels.',
          },
          {
            file_data: {
              file_uri: fileUri,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens,
    },
  });

  // Attempt with retries
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const { statusCode, body: responseText } = await childProcessPost(
        requestUrl,
        bodyJson,
        { 'Content-Type': 'application/json' },
        timeoutMs
      );

      if (statusCode !== 200) {
        const statusError = new Error(
          `Gemini audio transcription API error ${statusCode}: ${responseText.slice(0, 500)}`
        );

        if (statusCode === 400 || statusCode === 403) {
          throw statusError;
        }

        if (statusCode === 429) {
          console.warn(
            `[Gemini] Rate limit (429) hit for audio transcription. Will retry if attempts remain.`
          );
        }

        throw statusError;
      }

      const data = JSON.parse(responseText) as GeminiResponse;

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('Gemini audio transcription returned no candidates');
      }

      const candidate = data.candidates[0];
      if (!candidate.content?.parts || candidate.content.parts.length === 0) {
        throw new Error('Gemini audio transcription returned empty content');
      }

      const transcript = candidate.content.parts.map((p) => p.text).join('');
      if (!transcript.trim()) {
        throw new Error('Gemini audio transcription returned empty transcript');
      }

      if (attempt > 0) {
        console.log(`[Gemini] Audio transcription succeeded on attempt ${attempt + 1}`);
      }

      return transcript;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(
          `Audio transcription timed out after ${timeoutMs / 1000}s` +
            (durationMin
              ? ` for a ${durationMin}-min audio. Try a shorter audio or retry later.`
              : '.')
        );
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      const canRetry = attempt < RETRY_DELAYS.length && isRetryableError(error);
      if (!canRetry) {
        console.error('[Gemini] Audio transcription failed (no more retries):', {
          name: lastError.name,
          message: lastError.message,
          attempt: attempt + 1,
          fileUri,
          durationMin,
          timeoutMs,
        });
        throw lastError;
      }

      const delay = RETRY_DELAYS[attempt];
      console.warn(
        `[Gemini] Audio transcription attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay / 1000}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));

      continue;
    }
  }

  throw lastError ?? new Error('Gemini audio transcription failed after all retries');
}
