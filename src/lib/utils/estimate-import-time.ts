/**
 * Estimate import processing time per URL and for batch.
 *
 * Based on platform, caption availability, and video duration.
 * Batch estimate uses max (parallel processing via Promise.allSettled).
 */

export interface UrlEstimateInput {
  platform: 'youtube' | 'twitter' | 'other';
  hasCaptions?: boolean;
  durationSeconds?: number | null;
}

export interface TimeEstimate {
  perUrl: number[]; // seconds per URL
  batch: number; // total batch estimate (max of individual)
}

/**
 * Estimate processing time for a single URL in seconds.
 */
export function estimateUrlSeconds(input: UrlEstimateInput): number {
  if (input.platform !== 'youtube') return 5;
  if (input.hasCaptions) return 8;

  const minutes = Math.ceil((input.durationSeconds || 600) / 60);
  const downloadTime = 12; // ytdl-core ~10-15s
  const transcribeRate = 1; // Deepgram ~1s/min
  const analysisTime = 15; // sentiment + arguments
  return downloadTime + minutes * transcribeRate + analysisTime;
}

/**
 * Estimate import time for a batch of URLs.
 * Returns per-URL estimates and batch total (max, since URLs process in parallel).
 */
export function estimateImportTime(urls: UrlEstimateInput[]): TimeEstimate {
  const perUrl = urls.map(estimateUrlSeconds);
  const batch = perUrl.length > 0 ? Math.max(...perUrl) : 0;
  return { perUrl, batch };
}

/**
 * Format seconds as human-readable estimate string.
 * e.g., 87 → "~1.5 min", 5 → "~5 sec"
 */
export function formatTimeEstimate(seconds: number): string {
  if (seconds < 60) return `~${seconds} sec`;
  const minutes = (seconds / 60).toFixed(1).replace(/\.0$/, '');
  return `~${minutes} min`;
}
