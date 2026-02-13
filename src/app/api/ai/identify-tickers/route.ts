/**
 * AI Ticker Identification API
 * POST /api/ai/identify-tickers
 */

import { NextRequest, NextResponse } from 'next/server';
import { identifyTickers } from '@/domain/services/ai.service';
import { checkAiQuota, consumeAiQuota } from '@/infrastructure/repositories/ai-usage.repository';

const DEV_USER_ID = process.env.DEV_USER_ID || '00000000-0000-0000-0000-000000000001';

interface IdentifyTickersRequest {
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as IdentifyTickersRequest;

    // 驗證輸入
    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'content is required and must be a string' },
        { status: 400 }
      );
    }

    if (body.content.length < 10) {
      return NextResponse.json(
        { error: 'content must be at least 10 characters' },
        { status: 400 }
      );
    }

    if (body.content.length > 10000) {
      return NextResponse.json(
        { error: 'content must be less than 10000 characters' },
        { status: 400 }
      );
    }

    // 檢查配額
    const hasQuota = await checkAiQuota(DEV_USER_ID);
    if (!hasQuota) {
      return NextResponse.json(
        { error: 'AI quota exceeded. Please wait until next week.' },
        { status: 429 }
      );
    }

    // 執行標的識別
    const result = await identifyTickers(body.content);

    // 消耗配額
    const usage = await consumeAiQuota(DEV_USER_ID);

    return NextResponse.json({
      ...result,
      usage: {
        remaining: usage.remaining,
        weeklyLimit: usage.weeklyLimit,
        resetAt: usage.resetAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('AI identify-tickers error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
