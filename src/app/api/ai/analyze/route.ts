/**
 * AI 情緒分析 API (Re-roll analysis)
 * POST /api/ai/analyze
 *
 * Costs 3 credits (CREDIT_COSTS.reroll_analysis)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { analyzeSentiment } from '@/domain/services/ai.service';
import { consumeCredits } from '@/infrastructure/repositories/ai-usage.repository';
import { CREDIT_COSTS } from '@/domain/models/user';
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

    // Consume credits for re-roll analysis (3 credits)
    let creditInfo;
    try {
      creditInfo = await consumeCredits(userId, CREDIT_COSTS.reroll_analysis, 'reroll_analysis');
    } catch (quotaErr) {
      if (
        quotaErr &&
        typeof quotaErr === 'object' &&
        'code' in quotaErr &&
        (quotaErr as { code: string }).code === 'INSUFFICIENT_CREDITS'
      ) {
        return errorResponse(
          429,
          'INSUFFICIENT_CREDITS',
          'Insufficient credits. Please wait until next week or upgrade your plan.'
        );
      }
      throw quotaErr;
    }

    // 執行情緒分析
    const result = await analyzeSentiment(parsed.data.content);

    return NextResponse.json({
      ...result,
      usage: {
        remaining: creditInfo.balance,
        weeklyLimit: creditInfo.weeklyLimit,
        resetAt: creditInfo.resetAt?.toISOString(),
      },
    });
  } catch (error) {
    return internalError(error, 'AI analysis failed');
  }
}
