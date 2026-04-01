'use client';

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';
import { kolKeys } from './use-kols';
import { postKeys } from './use-posts';
import { useImportStatusStore, generateJobId } from '@/stores/import-status.store';
import { estimateImportTime, type UrlEstimateInput } from '@/lib/utils/estimate-import-time';
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
  firstImportFreeUsed: boolean;
}

export interface ImportBatchInput {
  urls: string[];
}

// ── Query Keys ──

export const importKeys = {
  all: ['import'] as const,
};

const YOUTUBE_PATTERN = /youtube\.com|youtu\.be/i;

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

/**
 * Non-blocking import hook.
 * Fires the import mutation in the background and updates the Zustand store.
 * Returns immediately so the caller can close the form.
 */
export function useBackgroundImport() {
  const importBatch = useImportBatch();
  const addJob = useImportStatusStore((s) => s.addJob);
  const updateJobProcessing = useImportStatusStore((s) => s.updateJobProcessing);
  const completeJob = useImportStatusStore((s) => s.completeJob);
  const failJob = useImportStatusStore((s) => s.failJob);

  const startImport = useCallback(
    (urls: string[]) => {
      const jobId = generateJobId();

      // Estimate time
      const urlInputs: UrlEstimateInput[] = urls.map((url) => ({
        platform: YOUTUBE_PATTERN.test(url) ? 'youtube' : 'twitter',
        hasCaptions: false,
        durationSeconds: null,
      }));
      const { batch } = estimateImportTime(urlInputs);

      // Add to store (shows toast immediately)
      addJob(jobId, urls, batch);

      // Fire mutation in background
      setTimeout(() => {
        updateJobProcessing(jobId);
      }, 100);

      importBatch.mutate(
        { urls },
        {
          onSuccess: (result) => completeJob(jobId, result),
          onError: (error) => failJob(jobId, error.message),
        }
      );

      return jobId;
    },
    [importBatch, addJob, updateJobProcessing, completeJob, failJob]
  );

  return { startImport, isPending: importBatch.isPending };
}
