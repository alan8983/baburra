/**
 * AI 配額查詢 API
 * GET /api/ai/usage
 */

import { NextResponse } from 'next/server';
import { getAiUsage } from '@/infrastructure/repositories/ai-usage.repository';

// 開發期間使用的測試用戶 ID
const DEV_USER_ID = process.env.DEV_USER_ID || '00000000-0000-0000-0000-000000000001';

export async function GET() {
  try {
    const usage = await getAiUsage(DEV_USER_ID);

    return NextResponse.json({
      usageCount: usage.usageCount,
      weeklyLimit: usage.weeklyLimit,
      remaining: usage.remaining,
      resetAt: usage.resetAt?.toISOString() || null,
      subscriptionTier: usage.subscriptionTier,
    });
  } catch (error) {
    console.error('AI usage error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
