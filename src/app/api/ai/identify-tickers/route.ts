/**
 * AI Ticker Identification API
 * POST /api/ai/identify-tickers
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { identifyTickers } from '@/domain/services/ai.service';
import { consumeAiQuota } from '@/infrastructure/repositories/ai-usage.repository';
import { unauthorizedError, internalError, errorResponse } from '@/lib/api/error';
import { aiContentSchema, parseBody } from '@/lib/api/validation';

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }
    const parsed = await parseBody(request, aiContentSchema);
    if ('error' in parsed) return parsed.error;

    // 原子性消耗配額（先扣再用，避免 race condition）
    let usage;
    try {
      usage = await consumeAiQuota(userId);
    } catch (quotaErr) {
      if (
        quotaErr &&
        typeof quotaErr === 'object' &&
        'code' in quotaErr &&
        (quotaErr as { code: string }).code === 'AI_QUOTA_EXCEEDED'
      ) {
        return errorResponse(
          429,
          'AI_QUOTA_EXCEEDED',
          'AI quota exceeded. Please wait until next week.'
        );
      }
      throw quotaErr;
    }

    // 執行標的識別
    const result = await identifyTickers(parsed.data.content);

    return NextResponse.json({
      ...result,
      usage: {
        remaining: usage.remaining,
        weeklyLimit: usage.weeklyLimit,
        resetAt: usage.resetAt?.toISOString(),
      },
    });
  } catch (error) {
    return internalError(error, 'Ticker identification failed');
  }
}
