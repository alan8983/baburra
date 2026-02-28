'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';
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
  kolId?: string;
  kolName?: string;
  kolCreated?: boolean;
}

export interface ImportKolSummary {
  kolId: string;
  kolName: string;
  kolCreated: boolean;
  postCount: number;
}

export interface ImportBatchResult {
  kols: ImportKolSummary[];
  urlResults: ImportUrlResult[];
  totalImported: number;
  totalDuplicate: number;
  totalError: number;
  onboardingQuotaUsed: boolean;
}

export interface ImportBatchInput {
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

      await throwIfNotOk(res);
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
