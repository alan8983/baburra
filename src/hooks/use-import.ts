'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';
import { kolKeys } from './use-kols';
import { postKeys } from './use-posts';
import type { Sentiment } from '@/domain/models/post';

// ── Types (mirroring import-pipeline.service.ts) ──

export interface ImportUrlResult {
  url: string;
  status: 'success' | 'duplicate' | 'error';
  postId?: string;
  title?: string;
  sourcePlatform?: string;
  error?: string;
  stockTickers?: string[];
  sentiment?: Sentiment;
}

export interface ImportBatchResult {
  kolId: string;
  kolName: string;
  kolCreated: boolean;
  urlResults: ImportUrlResult[];
  totalImported: number;
  totalDuplicate: number;
  totalError: number;
  onboardingQuotaUsed: boolean;
}

export interface ImportBatchInput {
  kolName: string;
  urls: string[];
}

// ── Query Keys ──

export const importKeys = {
  all: ['import'] as const,
};

// ── Mutation Hook ──

export function useImportBatch() {
  const queryClient = useQueryClient();

  return useMutation<ImportBatchResult, Error, ImportBatchInput>({
    mutationFn: async (input: ImportBatchInput) => {
      const res = await fetch(API_ROUTES.IMPORT_BATCH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const serverMessage = errorData?.error?.message || errorData?.error || 'Import failed';
        throw new Error(typeof serverMessage === 'string' ? serverMessage : 'Import failed');
      }

      return res.json();
    },
    onSuccess: () => {
      // Invalidate KOL and post lists since we may have created new ones
      queryClient.invalidateQueries({ queryKey: kolKeys.lists() });
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] });
    },
  });
}
