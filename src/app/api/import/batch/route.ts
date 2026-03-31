/**
 * Batch Import API — 批次匯入 KOL 文章
 * POST /api/import/batch
 *
 * 接受 1-5 則 URL，自動擷取內容、偵測 KOL、建立 Post、AI 分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { executeBatchImport } from '@/domain/services/import-pipeline.service';
import { parseBody } from '@/lib/api/validation';
import { unauthorizedError, internalError } from '@/lib/api/error';

// Long captionless videos (up to 120 min) use audio download + Gemini File API.
// Pipeline: download (~10s) + upload (~10s) + transcribe (~120s) + analysis (~30s) = ~170s.
// Use 280s to accommodate the full pipeline with margin.
const BATCH_TIMEOUT_MS = 280_000;

const importBatchSchema = z.object({
  urls: z
    .array(z.string().url().max(2000))
    .min(1, 'At least one URL is required')
    .max(5, 'Maximum 5 URLs'),
});

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    const parsed = await parseBody(request, importBatchSchema);
    if ('error' in parsed) return parsed.error;

    const result = await Promise.race([
      executeBatchImport({ urls: parsed.data.urls }, userId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Batch import timed out')), BATCH_TIMEOUT_MS)
      ),
    ]);

    return NextResponse.json(result);
  } catch (error) {
    return internalError(error, 'Failed to process batch import');
  }
}
