/**
 * AI 論點提取 API
 * POST /api/ai/extract-arguments
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { extractArguments } from '@/domain/services/ai.service';
import { consumeAiQuota } from '@/infrastructure/repositories/ai-usage.repository';
import { unauthorizedError, internalError, errorResponse } from '@/lib/api/error';
import {
  getArgumentCategoryByCode,
  createPostArguments,
} from '@/infrastructure/repositories/argument.repository';
import { aiExtractArgumentsSchema, parseBody } from '@/lib/api/validation';

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }
    const parsed = await parseBody(request, aiExtractArgumentsSchema);
    if ('error' in parsed) return parsed.error;

    // 原子性消耗配額（先扣再用，避免 race condition）
    let usage;
    try {
      usage = await consumeAiQuota(userId);
    } catch (quotaErr) {
      if (
        (quotaErr &&
          typeof quotaErr === 'object' &&
          'code' in quotaErr &&
          (quotaErr as { code: string }).code === 'AI_QUOTA_EXCEEDED') ||
        (quotaErr as { code: string }).code === 'INSUFFICIENT_CREDITS'
      ) {
        return errorResponse(
          429,
          'AI_QUOTA_EXCEEDED',
          'AI quota exceeded. Please wait until next week.'
        );
      }
      throw quotaErr;
    }

    // 對每個標的執行論點提取
    const allArguments: {
      stockId: string;
      ticker: string;
      arguments: Awaited<ReturnType<typeof extractArguments>>['arguments'];
    }[] = [];

    for (const stock of parsed.data.stocks) {
      const result = await extractArguments(parsed.data.content, stock.ticker, stock.name);
      allArguments.push({
        stockId: stock.id,
        ticker: stock.ticker,
        arguments: result.arguments,
      });
    }

    // 儲存論點到資料庫
    const savedArguments: Array<{
      stockId: string;
      ticker: string;
      categoryCode: string;
      summary: string;
      sentiment: number;
    }> = [];

    for (const stockArgs of allArguments) {
      for (const arg of stockArgs.arguments) {
        // 取得 category ID
        const category = await getArgumentCategoryByCode(arg.categoryCode);
        if (!category) {
          console.warn(`Unknown category code: ${arg.categoryCode}`);
          continue;
        }

        // 建立論點記錄
        await createPostArguments([
          {
            postId: parsed.data.postId,
            stockId: stockArgs.stockId,
            categoryId: category.id,
            originalText: arg.originalText,
            summary: arg.summary,
            sentiment: arg.sentiment,
            confidence: arg.confidence,
            statementType: arg.statementType,
          },
        ]);

        savedArguments.push({
          stockId: stockArgs.stockId,
          ticker: stockArgs.ticker,
          categoryCode: arg.categoryCode,
          summary: arg.summary,
          sentiment: arg.sentiment,
        });
      }
    }

    return NextResponse.json({
      arguments: savedArguments,
      usage: {
        remaining: usage.remaining,
        weeklyLimit: usage.weeklyLimit,
        resetAt: usage.resetAt?.toISOString(),
      },
    });
  } catch (error) {
    return internalError(error, 'Argument extraction failed');
  }
}
