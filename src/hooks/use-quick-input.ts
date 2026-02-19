'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('input');

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
          UNSUPPORTED_URL: t('errors.unsupportedUrl'),
          AI_QUOTA_EXCEEDED: t('errors.aiQuotaExceeded'),
          FETCH_FAILED: t('errors.fetchFailed'),
          EMPTY_CONTENT: t('errors.emptyContent'),
        };

        const message =
          (code && friendlyMessages[code]) || serverMessage || t('errors.createDraftFailed');
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
