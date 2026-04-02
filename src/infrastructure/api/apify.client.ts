/**
 * Apify Client Wrapper
 *
 * Thin facade over the `apify-client` SDK that adds:
 * - Timeout enforcement
 * - Error normalization to ExtractorError codes
 * - Both synchronous (single-post) and async (profile discovery) patterns
 */

import { ApifyClient as ApifySDK } from 'apify-client';
import { ExtractorError } from '@/infrastructure/extractors/types';

const DEFAULT_TIMEOUT_MS = 120_000;

const sdk = new ApifySDK({ token: process.env.APIFY_API_TOKEN });

export interface ApifyRunResult {
  runId: string;
  datasetId: string;
}

/**
 * Run an Apify Actor synchronously — blocks until the run finishes and returns
 * dataset items directly. Best for single-post extraction (<60s).
 */
export async function runActorSync<T = Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T[]> {
  try {
    const run = await sdk.actor(actorId).call(input, {
      waitSecs: Math.ceil(timeoutMs / 1000),
    });
    const { items } = await sdk.dataset(run.defaultDatasetId).listItems();
    return items as T[];
  } catch (error) {
    throw normalizeError(error, actorId);
  }
}

/**
 * Start an Apify Actor asynchronously — returns immediately with run/dataset IDs.
 * Use `waitForRun()` + `getDatasetItems()` to retrieve results.
 */
export async function runActor(
  actorId: string,
  input: Record<string, unknown>
): Promise<ApifyRunResult> {
  try {
    const run = await sdk.actor(actorId).start(input);
    return {
      runId: run.id,
      datasetId: run.defaultDatasetId,
    };
  } catch (error) {
    throw normalizeError(error, actorId);
  }
}

/**
 * Poll until an Actor run completes or times out.
 */
export async function waitForRun(
  runId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const pollInterval = 3_000;

  while (Date.now() < deadline) {
    const run = await sdk.run(runId).get();
    if (!run) {
      throw new ExtractorError('FETCH_FAILED', `Apify run ${runId} not found`);
    }
    if (run.status === 'SUCCEEDED') return;
    if (run.status === 'FAILED' || run.status === 'ABORTED' || run.status === 'TIMED-OUT') {
      throw new ExtractorError(
        'FETCH_FAILED',
        `Apify run ${runId} ended with status: ${run.status}`
      );
    }
    await sleep(pollInterval);
  }

  throw new ExtractorError('NETWORK_ERROR', `Apify run ${runId} timed out after ${timeoutMs}ms`);
}

/**
 * Retrieve items from a completed run's default dataset.
 */
export async function getDatasetItems<T = Record<string, unknown>>(
  datasetId: string,
  limit?: number
): Promise<T[]> {
  try {
    const { items } = await sdk.dataset(datasetId).listItems({ limit });
    return items as T[];
  } catch (error) {
    throw normalizeError(error, `dataset:${datasetId}`);
  }
}

// ── Helpers ──

function normalizeError(error: unknown, context: string): ExtractorError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return new ExtractorError('NETWORK_ERROR', `Apify timeout (${context}): ${message}`);
  }
  return new ExtractorError(
    'FETCH_FAILED',
    `Apify error (${context}): ${message}`,
    error instanceof Error ? error : undefined
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
