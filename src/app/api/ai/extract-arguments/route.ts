/**
 * AI 論點提取 API
 * POST /api/ai/extract-arguments
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { extractArguments } from '@/domain/services/ai.service';
import { consumeAiQuota } from '@/infrastructure/repositories/ai-usage.repository';
import { internalError } from '@/lib/api/error';
import {
  getArgumentCategoryByCode,
  createPostArguments,
} from '@/infrastructure/repositories/argument.repository';

interface ExtractArgumentsRequest {
  content: string;
  postId: string;
  stocks: {
    id: string;
    ticker: string;
    name: string;
  }[];
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = (await request.json()) as ExtractArgumentsRequest;

    // 驗證輸入
    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'content is required and must be a string' },
        { status: 400 }
      );
    }

    if (!body.postId) {
      return NextResponse.json({ error: 'postId is required' }, { status: 400 });
    }

    if (!body.stocks || !Array.isArray(body.stocks) || body.stocks.length === 0) {
      return NextResponse.json({ error: 'stocks must be a non-empty array' }, { status: 400 });
    }

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
        return NextResponse.json(
          { error: 'AI quota exceeded. Please wait until next week.' },
          { status: 429 }
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

    for (const stock of body.stocks) {
      const result = await extractArguments(body.content, stock.ticker, stock.name);
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
            postId: body.postId,
            stockId: stockArgs.stockId,
            categoryId: category.id,
            originalText: arg.originalText,
            summary: arg.summary,
            sentiment: arg.sentiment,
            confidence: arg.confidence,
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
