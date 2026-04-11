/**
 * Batch Import API — 非同步批次匯入 KOL 文章
 * POST /api/import/batch
 *
 * Creates a `scrape_jobs` row of type `batch_import`, seeds one
 * `scrape_job_items` row per URL, and fires a fire-and-forget
 * `/continue` call to drive the pipeline forward. Returns { jobId }
 * immediately — no more 280 s synchronous wait. The frontend then
 * transitions into the shared ScrapeProgress UI with per-URL progress.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { createScrapeJob, createScrapeJobItems } from '@/infrastructure/repositories';
import { parseBody } from '@/lib/api/validation';
import { unauthorizedError, internalError } from '@/lib/api/error';
import { API_ROUTES } from '@/lib/constants';

const importBatchSchema = z.object({
  urls: z
    .array(z.string().url().max(2000))
    .min(1, 'At least one URL is required')
    .max(5, 'Maximum 5 URLs'),
});

// Kept generous so the fire-and-forget /continue invocation has room to do
// useful work even on cold starts, while the initial response still returns
// fast (see the handler below).
export const maxDuration = 300;

function getBaseUrl(req: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  // Fall back to the inbound request's origin — works for local dev and
  // anywhere behind a reverse proxy that sets x-forwarded-host.
  const { protocol, host } = new URL(req.url);
  return `${protocol}//${host}`;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    const parsed = await parseBody(request, importBatchSchema);
    if ('error' in parsed) return parsed.error;

    const urls = parsed.data.urls;

    // 1. Create a scrape_jobs row of type batch_import. kol_source_id is
    //    null because batch imports are user-supplied URLs with no backing
    //    KOL source (processUrl auto-detects the KOL per URL).
    const job = await createScrapeJob(null, 'batch_import', userId, urls);

    // 2. Seed one scrape_job_items row per URL so the UI can render a
    //    per-URL checklist from the moment the job appears.
    await createScrapeJobItems(
      job.id,
      urls.map((url) => ({ url }))
    );

    // 3. Fire-and-forget /continue to start processing. We don't await
    //    the fetch — the response returns immediately and the pipeline
    //    runs in the background. Cookies are forwarded so the continue
    //    route sees the same authenticated user.
    const baseUrl = getBaseUrl(request);
    fetch(`${baseUrl}${API_ROUTES.SCRAPE_JOB_CONTINUE(job.id)}`, {
      method: 'POST',
      headers: {
        // Forward the cookie header so getCurrentUserId() in /continue
        // resolves to the same user.
        cookie: request.headers.get('cookie') ?? '',
      },
    }).catch((err) => {
      console.warn('[import/batch] fire-and-forget /continue failed:', err);
    });

    return NextResponse.json({ jobId: job.id, totalUrls: urls.length });
  } catch (error) {
    return internalError(error, 'Failed to create batch import job');
  }
}
