'use client';

// URL Fetch hook - 呼叫 /api/fetch-url 擷取社群媒體內容

import { useMutation } from '@tanstack/react-query';
import type { UrlFetchResult } from '@/infrastructure/extractors';
import { API_ROUTES } from '@/lib/constants';
import { ApiError, throwIfNotOk } from '@/lib/api/fetch-error';

// Re-export URL utilities from shared module for backward compatibility
export {
  isUrlLike,
  getSupportedPlatform,
  getPlannedPlatform,
  getSupportedPlatformNames,
  getPlannedPlatformNames,
} from '@/lib/utils/url';

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

      try {
        await throwIfNotOk(res);
      } catch (err) {
        if (err instanceof ApiError) {
          // 將後端錯誤碼轉換為使用者友善的中文訊息
          const friendlyMessages: Record<string, string> = {
            INVALID_URL: '此網址的平台尚不支援自動擷取，請改為手動輸入文章內容',
            FETCH_FAILED: '無法連線至該網址，請確認網址是否正確',
            PARSE_FAILED: '無法解析網頁內容，請改為手動輸入文章內容',
            CONTENT_TOO_SHORT: '擷取到的內容過短，請改為手動輸入文章內容',
            CONTENT_TOO_LONG: '擷取到的內容過長，請手動擷取重點內容',
            NETWORK_ERROR: '網路連線錯誤，請稍後再試',
          };
          const message =
            (err.code && friendlyMessages[err.code]) || err.message || '擷取失敗，請稍後再試';
          throw new ApiError(err.status, { error: { code: err.code ?? undefined, message } });
        }
        throw err;
      }

      const json = await res.json();
      return json.data;
    },
  });
}
