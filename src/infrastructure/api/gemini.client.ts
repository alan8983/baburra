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
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Model fallback chain. Tried in order; quota errors (429 / RESOURCE_EXHAUSTED)
 * roll over to the next model. Non-quota errors propagate immediately.
 *
 * Default chain prefers Gemma 4 (free quota) and falls back to Gemini 2.5 Flash Lite.
 * Override with AI_MODEL_CHAIN env var (comma-separated).
 * Legacy AI_SENTIMENT_MODEL pins to a single model with no fallback.
 */
const DEFAULT_MODEL_CHAIN: string[] = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-2.5-flash-lite',
];

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

const EFFECTIVE_CHAIN = buildEffectiveChain();

/**
 * Return the primary configured AI model name (for DB version tracking).
 * Note: this returns the *intended* primary model, not the actual model used
 * if a fallback fired. The DB column is informational.
 */
export function getAiModelVersion(): string {
  return EFFECTIVE_CHAIN[0];
}

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
}

async function withModelFallback<T>(
  fn: (model: string) => Promise<T>,
  explicitModel?: string
): Promise<T> {
  const chain = explicitModel ? [explicitModel] : EFFECTIVE_CHAIN;
  let lastErr: unknown;
  for (const model of chain) {
    try {
      return await fn(model);
    } catch (err) {
      lastErr = err;
      if (!isQuotaError(err)) throw err;
      console.warn(
        `[gemini.client] Model "${model}" hit quota, falling back to next model in chain`
      );
    }
  }
  throw lastErr;
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
  model?: string
): Promise<string> {
  return withModelFallback((m) => generateContentWithModel(prompt, options, m), model);
}

async function generateContentWithModel(
  prompt: string,
  options: GeminiGenerateOptions | undefined,
  model: string
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
  model?: string
): Promise<T> {
  return withModelFallback(
    (m) => generateStructuredJsonWithModel<T>(prompt, schema, options, m),
    model
  );
}

async function generateStructuredJsonWithModel<T>(
  prompt: string,
  schema: Record<string, unknown>,
  options: GeminiGenerateOptions | undefined,
  model: string
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
  model?: string
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
