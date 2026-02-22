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
import { internalError } from '@/lib/api/error';

const importBatchSchema = z.object({
  urls: z
    .array(z.string().url().max(2000))
    .min(1, 'At least one URL is required')
    .max(5, 'Maximum 5 URLs'),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please log in' } },
        { status: 401 }
      );
    }

    const parsed = await parseBody(request, importBatchSchema);
    if ('error' in parsed) return parsed.error;

    const result = await executeBatchImport({ urls: parsed.data.urls }, userId);

    return NextResponse.json(result);
  } catch (error) {
    return internalError(error, 'Failed to process batch import');
  }
}
