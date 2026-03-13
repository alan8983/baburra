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
const DEFAULT_TIMEOUT_MS = 30_000;

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
