'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';
import { draftKeys } from './use-drafts';

interface QuickInputResult {
  draft: { id: string };
}

/**
 * 快速輸入 hook — 一鍵建立草稿（含 AI 分析）
 */
export function useQuickInput() {
  const queryClient = useQueryClient();

  return useMutation<QuickInputResult, Error, string>({
    mutationFn: async (content: string) => {
      const res = await fetch(API_ROUTES.QUICK_INPUT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const code = errorData?.error?.code as string | undefined;
        const serverMessage = errorData?.error?.message as string | undefined;

        const friendlyMessages: Record<string, string> = {
          UNSUPPORTED_URL: '此網址平台尚不支援，請改為貼上文章內容',
          AI_QUOTA_EXCEEDED: 'AI 分析額度已用完，請下週再試',
          FETCH_FAILED: '無法擷取網址內容，請確認網址是否正確',
          EMPTY_CONTENT: '請輸入內容',
        };

        const message =
          (code && friendlyMessages[code]) || serverMessage || '建立草稿失敗，請稍後再試';
        throw new Error(message);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] });
    },
  });
}
