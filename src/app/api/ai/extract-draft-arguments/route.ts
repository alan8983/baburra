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
import { checkAiQuota, consumeAiQuota } from '@/infrastructure/repositories/ai-usage.repository';
import type { DraftAiArguments } from '@/domain/models';

interface ExtractDraftArgumentsRequest {
  content: string;
  stocks: {
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

    const body = (await request.json()) as ExtractDraftArgumentsRequest;

    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'content is required and must be a string' },
        { status: 400 }
      );
    }

    if (!body.stocks || !Array.isArray(body.stocks) || body.stocks.length === 0) {
      return NextResponse.json({ error: 'stocks must be a non-empty array' }, { status: 400 });
    }

    const hasQuota = await checkAiQuota(userId);
    if (!hasQuota) {
      return NextResponse.json(
        { error: 'AI quota exceeded. Please wait until next week.' },
        { status: 429 }
      );
    }

    // 對每個標的並行執行論點提取（同 quick-input 模式）
    const results = await Promise.allSettled(
      body.stocks.map((stock) => extractArguments(body.content, stock.ticker, stock.name))
    );

    const aiArguments: DraftAiArguments[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value.arguments.length > 0) {
        aiArguments.push({
          ticker: body.stocks[i].ticker,
          name: body.stocks[i].name,
          arguments: result.value.arguments,
        });
      } else if (result.status === 'rejected') {
        console.error(
          `Draft argument extraction failed for ${body.stocks[i].ticker}:`,
          result.reason
        );
      }
    }

    const usage = await consumeAiQuota(userId);

    return NextResponse.json({
      arguments: aiArguments,
      usage: {
        remaining: usage.remaining,
        weeklyLimit: usage.weeklyLimit,
        resetAt: usage.resetAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('AI extract-draft-arguments error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
