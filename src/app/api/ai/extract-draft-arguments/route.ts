/**
 * AI 草稿論點提取 API
 * POST /api/ai/extract-draft-arguments
 *
 * 與 /api/ai/extract-arguments 不同：不需要 postId，不寫入 post_arguments 表。
 * 回傳 DraftAiArguments[] 格式，由客戶端自行儲存到草稿。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { extractArguments } from '@/domain/services/ai.service';
import { consumeAiQuota } from '@/infrastructure/repositories/ai-usage.repository';
import { unauthorizedError, internalError, errorResponse } from '@/lib/api/error';
import type { DraftAiArguments } from '@/domain/models';
import { aiExtractDraftArgumentsSchema, parseBody } from '@/lib/api/validation';

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    const parsed = await parseBody(request, aiExtractDraftArgumentsSchema);
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

    // 對每個標的並行執行論點提取（同 quick-input 模式）
    const results = await Promise.allSettled(
      parsed.data.stocks.map((stock) =>
        extractArguments(parsed.data.content, stock.ticker, stock.name)
      )
    );

    const aiArguments: DraftAiArguments[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value.arguments.length > 0) {
        aiArguments.push({
          ticker: parsed.data.stocks[i].ticker,
          name: parsed.data.stocks[i].name,
          arguments: result.value.arguments,
        });
      } else if (result.status === 'rejected') {
        console.error(
          `Draft argument extraction failed for ${parsed.data.stocks[i].ticker}:`,
          result.reason
        );
      }
    }

    return NextResponse.json({
      arguments: aiArguments,
      usage: {
        remaining: usage.remaining,
        weeklyLimit: usage.weeklyLimit,
        resetAt: usage.resetAt?.toISOString(),
      },
    });
  } catch (error) {
    return internalError(error, 'AI extract-draft-arguments failed');
  }
}
