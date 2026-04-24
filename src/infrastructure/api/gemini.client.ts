/**
 * Google Gemini AI API 客戶端
 * @see https://ai.google.dev/gemini-api/docs
 */

import type { GeminiCallMeta } from '@/domain/models/pipeline-timing';

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
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Model fallback chain. Tried in order; quota errors (429 / RESOURCE_EXHAUSTED)
 * roll over to the next model. Non-quota errors propagate immediately.
 *
 * Default: Gemini 2.5 Flash Lite (4K RPM, 4M TPM — handles large transcripts).
 * Gemma 4 models have only 16K TPM, too low for 50-min transcript analysis.
 * Override with AI_MODEL_CHAIN env var (comma-separated).
 * Legacy AI_SENTIMENT_MODEL pins to a single model with no fallback.
 */
const DEFAULT_MODEL_CHAIN: string[] = ['gemini-2.5-flash-lite'];

function buildEffectiveChain(): string[] {
  if (process.env.AI_SENTIMENT_MODEL) {
    return [process.env.AI_SENTIMENT_MODEL];
  }
  if (process.env.AI_MODEL_CHAIN) {
    const parsed = process.env.AI_MODEL_CHAIN.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length > 0) return parsed;
  }
  return DEFAULT_MODEL_CHAIN;
}

/* ── Lazy initialisation ─────────────────────────────────────────────────────
 * Scripts (e.g. scrape-gooaye-yt-601-650.ts) parse .env.local BEFORE importing
 * this module, but ES imports are hoisted — so module-level code runs before
 * the env-loading loop. We defer chain/pool construction to first use.
 */
let _effectiveChain: string[] | null = null;
function getEffectiveChain(): string[] {
  if (!_effectiveChain) _effectiveChain = buildEffectiveChain();
  return _effectiveChain;
}

/* ── Multi-key pool ──────────────────────────────────────────────────────────
 * Set GEMINI_API_KEYS (comma-separated) for N× quota headroom.
 * Falls back to single GEMINI_API_KEY for backwards-compatibility.
 * Keys are round-robined per request so load spreads evenly.
 */
function buildKeyPool(): string[] {
  const multi = process.env.GEMINI_API_KEYS;
  if (multi) {
    const keys = multi
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (keys.length > 0) return keys;
  }
  const single = process.env.GEMINI_API_KEY;
  if (single) return [single];
  return [];
}

let _keyPool: string[] | null = null;
function getKeyPool(): string[] {
  if (!_keyPool) _keyPool = buildKeyPool();
  return _keyPool;
}
let keyIndex = 0;

/* ── Backoff configuration ───────────────────────────────────────────────────
 * After exhausting the full model × key matrix, wait and retry.
 * Delays: 5 s → 15 s → 45 s → 90 s  (total max wait ≈ 155 s).
 * Free-tier quota resets per-minute, so we need waits long enough to span
 * at least one full reset window.
 */
const BACKOFF_DELAYS_MS = [5_000, 15_000, 45_000, 90_000];

/* ── Per-call cooldown (serialised) ───────────────────────────────────────────
 * Enforces a minimum gap between consecutive Gemini API calls to avoid
 * bursting through per-minute quota. Uses a promise-chain mutex so that
 * concurrent callers queue up instead of racing.
 * Default 1 500 ms; override with GEMINI_COOLDOWN_MS env var. Set to 0 to disable.
 */
const COOLDOWN_MS = Number(process.env.GEMINI_COOLDOWN_MS) || 1_500;
let lastCallTime = 0;
let cooldownQueue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cooldown(): Promise<void> {
  if (COOLDOWN_MS <= 0) return Promise.resolve();
  // Chain onto the queue — callers serialize through the mutex.
  // Sleep only the remaining gap since the last call (not a full COOLDOWN_MS every time).
  cooldownQueue = cooldownQueue.then(async () => {
    const elapsed = Date.now() - lastCallTime;
    if (elapsed < COOLDOWN_MS && lastCallTime > 0) {
      await sleep(COOLDOWN_MS - elapsed);
    }
    lastCallTime = Date.now();
  });
  return cooldownQueue;
}

/**
 * Return the primary configured AI model name (for DB version tracking).
 * Note: this returns the *intended* primary model, not the actual model used
 * if a fallback fired. The DB column is informational.
 */
export function getAiModelVersion(): string {
  return getEffectiveChain()[0];
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  // Quota / rate-limit errors
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
    return true;
  }
  // JSON parse failures from truncated structured output (MAX_TOKENS)
  if (err instanceof SyntaxError || msg.includes('MAX_TOKENS') || msg.includes('truncated')) {
    return true;
  }
  // Transient server errors
  if (msg.includes('503') || msg.includes('500')) {
    return true;
  }
  return false;
}

/**
 * Try each model × each API key. On full-matrix quota exhaustion,
 * back off and retry the entire matrix up to BACKOFF_DELAYS_MS.length times.
 * Non-quota errors propagate immediately.
 */
async function withModelFallback<T>(
  fn: (model: string, apiKey: string) => Promise<T>,
  explicitModel?: string,
  meta?: GeminiCallMeta
): Promise<T> {
  const chain = explicitModel ? [explicitModel] : getEffectiveChain();
  let lastErr: unknown;
  let retries = 0;

  // Outer: rotate keys. Inner: try all models per key.
  // This ensures model fallback (e.g. Gemma → Flash Lite) happens BEFORE
  // burning through keys on the same quota-limited model.
  for (let attempt = 0; attempt <= BACKOFF_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = BACKOFF_DELAYS_MS[attempt - 1];
      console.warn(
        `[gemini.client] All keys×models exhausted — backing off ${delay}ms (retry ${attempt}/${BACKOFF_DELAYS_MS.length})`
      );
      await sleep(delay);
    }

    for (let ki = 0; ki < getKeyPool().length; ki++) {
      const apiKey = getApiKey();
      // Snapshot the index actually used for THIS request (getApiKey() bumps keyIndex).
      const usedKeyIndex = (keyIndex - 1 + getKeyPool().length) % getKeyPool().length;
      let firstInKey = true;
      for (const model of chain) {
        try {
          // Only cooldown before the first model attempt per key —
          // fallback retries (e.g. Gemma→Flash Lite) fire immediately.
          if (firstInKey) {
            await cooldown();
            firstInKey = false;
          }
          const result = await fn(model, apiKey);
          if (meta) {
            meta.retries = retries;
            meta.keyIndex = usedKeyIndex;
            meta.finalModel = model;
          }
          return result;
        } catch (err) {
          lastErr = err;
          if (!isRetryableError(err)) {
            if (meta) {
              meta.retries = retries;
              meta.keyIndex = usedKeyIndex;
              meta.finalModel = model;
            }
            throw err;
          }
          retries++;
          const errMsg = err instanceof Error ? err.message.slice(0, 150) : String(err);
          console.warn(
            `[gemini.client] Model "${model}" key#${usedKeyIndex + 1}/${getKeyPool().length} quota error: ${errMsg}`
          );
        }
      }
    }
  }
  if (meta) meta.retries = retries;
  throw lastErr;
}

function getApiKey(): string {
  if (getKeyPool().length === 0) {
    throw new Error('GEMINI_API_KEY (or GEMINI_API_KEYS) is not set');
  }
  const key = getKeyPool()[keyIndex % getKeyPool().length];
  keyIndex++;
  return key;
}

/**
 * 使用 Gemini API 生成文字回應
 */
export async function generateContent(
  prompt: string,
  options?: GeminiGenerateOptions,
  model?: string,
  meta?: GeminiCallMeta
): Promise<string> {
  return withModelFallback(
    (m, key) => generateContentWithModel(prompt, options, m, key),
    model,
    meta
  );
}

async function generateContentWithModel(
  prompt: string,
  options: GeminiGenerateOptions | undefined,
  model: string,
  apiKey: string
): Promise<string> {
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
  model?: string,
  meta?: GeminiCallMeta
): Promise<T> {
  return withModelFallback(
    (m, key) => generateStructuredJsonWithModel<T>(prompt, schema, options, m, key),
    model,
    meta
  );
}

async function generateStructuredJsonWithModel<T>(
  prompt: string,
  schema: Record<string, unknown>,
  options: GeminiGenerateOptions | undefined,
  model: string,
  apiKey: string
): Promise<T> {
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

    // Detect truncated output before attempting parse
    if (candidate.finishReason === 'MAX_TOKENS') {
      throw new Error(
        `Gemini structured JSON truncated (MAX_TOKENS): maxOutputTokens=${options?.maxOutputTokens ?? 2048} was insufficient`
      );
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
  model?: string,
  meta?: GeminiCallMeta
): Promise<T> {
  const text = await generateContent(prompt, options, model, meta);

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
 * Transcribe a short YouTube video (<=60s) using Gemini file_uri.
 * Sends the YouTube URL directly to Gemini as a video file reference.
 * Returns the verbatim transcript text.
 */
export async function geminiTranscribeShort(youtubeUrl: string): Promise<string> {
  const apiKey = getApiKey();
  const model = 'gemini-2.5-flash-lite';
  const url = `${GEMINI_BASE}/models/${model}:generateContent`;
  const TRANSCRIBE_TIMEOUT_MS = 60_000;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            fileData: {
              fileUri: youtubeUrl,
              mimeType: 'video/*',
            },
          },
          {
            text: 'Transcribe this video verbatim. Output ONLY the spoken words, no timestamps, no speaker labels, no commentary. If the speech is in Chinese, output in Chinese. If in English, output in English. If mixed, preserve the original languages.',
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

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
      throw new Error(
        `Gemini transcription API error ${res.status}: ${errorText || res.statusText}`
      );
    }

    const data = (await res.json()) as GeminiResponse;

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('Gemini transcription returned no candidates');
    }

    const candidate = data.candidates[0];
    if (!candidate.content?.parts || candidate.content.parts.length === 0) {
      throw new Error('Gemini transcription returned empty content');
    }

    return candidate.content.parts.map((p) => p.text).join('');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Gemini transcription timed out after ${TRANSCRIBE_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
