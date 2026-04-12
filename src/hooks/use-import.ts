'use client';

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';
import { scrapeKeys } from './use-scrape';
import { useImportStatusStore, generateJobId } from '@/stores/import-status.store';
import { estimateImportTime, type UrlEstimateInput } from '@/lib/utils/estimate-import-time';

// ── Types (mirroring import-pipeline.service.ts) ──

/**
 * Response shape from the async batch-import endpoint. The synchronous
 * `ImportBatchResult` is no longer returned — the UI transitions into the
 * scrape-progress flow using `jobId` and subscribes to per-URL updates.
 */
export interface ImportBatchJobResponse {
  jobId: string;
  totalUrls: number;
}

export interface ImportBatchInput {
  urls: string[];
}

// ── Mutation Hook ──

export function useImportBatch() {
  const queryClient = useQueryClient();

  return useMutation<ImportBatchJobResponse, Error, ImportBatchInput>({
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
      // The new job shows up in the scrape-jobs list; UI subscribes to
      // per-URL items for the live progress view. Kol/post lists will
      // be refreshed by the scrape-progress flow as items finish.
      queryClient.invalidateQueries({ queryKey: scrapeKeys.jobs() });
    },
  });
}

const YOUTUBE_PATTERN = /youtube\.com|youtu\.be/i;

/**
 * Non-blocking import hook.
 * Fires the import mutation, which returns { jobId } almost immediately.
 * The Zustand store is updated with the jobId so the scrape-progress UI
 * can subscribe and render per-URL progress.
 */
export function useBackgroundImport() {
  const importBatch = useImportBatch();
  const addJob = useImportStatusStore((s) => s.addJob);
  const updateJobProcessing = useImportStatusStore((s) => s.updateJobProcessing);
  const failJob = useImportStatusStore((s) => s.failJob);
  const attachScrapeJob = useImportStatusStore((s) => s.attachScrapeJob);

  const startImport = useCallback(
    (urls: string[]) => {
      const localJobId = generateJobId();

      // Optimistic ETA estimate for the toast
      const urlInputs: UrlEstimateInput[] = urls.map((url) => ({
        platform: YOUTUBE_PATTERN.test(url) ? 'youtube' : 'twitter',
        hasCaptions: false,
        durationSeconds: null,
      }));
      const { batch } = estimateImportTime(urlInputs);

      addJob(localJobId, urls, batch);
      setTimeout(() => {
        updateJobProcessing(localJobId);
      }, 100);

      importBatch.mutate(
        { urls },
        {
          onSuccess: (response) => {
            // Hand the scrape job id to the status store so the toast /
            // status UI can subscribe to it for real-time per-URL updates.
            attachScrapeJob?.(localJobId, response.jobId);
          },
          onError: (error) => failJob(localJobId, error.message),
        }
      );

      return localJobId;
    },
    [importBatch, addJob, updateJobProcessing, failJob, attachScrapeJob]
  );

  return { startImport, isPending: importBatch.isPending };
}
