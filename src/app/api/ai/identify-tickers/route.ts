/**
 * AI Ticker Identification API
 * POST /api/ai/identify-tickers
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { identifyTickers } from '@/domain/services/ai.service';
import { consumeAiQuota } from '@/infrastructure/repositories/ai-usage.repository';
import { internalError } from '@/lib/api/error';

interface IdentifyTickersRequest {
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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

    // 執行標的識別
    const result = await identifyTickers(body.content);

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
