'use client';

// URL Fetch hook - 呼叫 /api/fetch-url 擷取社群媒體內容

import { useMutation } from '@tanstack/react-query';
import type { UrlFetchResult } from '@/infrastructure/extractors';
import { API_ROUTES } from '@/lib/constants';

/**
 * 判斷文字是否為 URL 格式
 */
export function isUrlLike(text: string): boolean {
  return /^https?:\/\/\S+/.test(text.trim());
}

/** 目前支援自動擷取的平台 */
const SUPPORTED_PATTERNS: { platform: string; pattern: RegExp }[] = [
  { platform: 'Facebook', pattern: /facebook\.com|fb\.com|fb\.watch/i },
  { platform: 'Twitter / X', pattern: /twitter\.com|x\.com/i },
  { platform: 'Threads', pattern: /threads\.net/i },
];

/**
 * 判斷 URL 是否為支援自動擷取的平台
 * 回傳平台名稱，不支援則回傳 null
 */
export function getSupportedPlatform(text: string): string | null {
  const trimmed = text.trim();
  for (const { platform, pattern } of SUPPORTED_PATTERNS) {
    if (pattern.test(trimmed)) return platform;
  }
  return null;
}

/**
 * 取得支援的平台列表（用於顯示給使用者）
 */
export function getSupportedPlatformNames(): string[] {
  return SUPPORTED_PATTERNS.map((p) => p.platform);
}

/**
 * URL 擷取 hook
 */
export function useFetchUrl() {
  return useMutation({
    mutationFn: async (url: string): Promise<UrlFetchResult> => {
      const res = await fetch(API_ROUTES.FETCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const code = errorData?.error?.code as string | undefined;
        const serverMessage = errorData?.error?.message as string | undefined;

        // 將後端錯誤碼轉換為使用者友善的中文訊息
        const friendlyMessages: Record<string, string> = {
          INVALID_URL: '此網址的平台尚不支援自動擷取，請改為手動輸入文章內容',
          FETCH_FAILED: '無法連線至該網址，請確認網址是否正確',
          PARSE_FAILED: '無法解析網頁內容，請改為手動輸入文章內容',
          CONTENT_TOO_SHORT: '擷取到的內容過短，請改為手動輸入文章內容',
          CONTENT_TOO_LONG: '擷取到的內容過長，請手動擷取重點內容',
          NETWORK_ERROR: '網路連線錯誤，請稍後再試',
        };

        const message = (code && friendlyMessages[code]) || serverMessage || '擷取失敗，請稍後再試';
        const error = new Error(message);
        (error as Error & { code?: string }).code = code;
        throw error;
      }

      const json = await res.json();
      return json.data;
    },
  });
}
