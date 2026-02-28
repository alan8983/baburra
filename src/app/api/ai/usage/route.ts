/**
 * AI 配額查詢 API
 * GET /api/ai/usage
 */

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getAiUsage } from '@/infrastructure/repositories/ai-usage.repository';
import { unauthorizedError, internalError } from '@/lib/api/error';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    const usage = await getAiUsage(userId);

    return NextResponse.json({
      usageCount: usage.usageCount,
      weeklyLimit: usage.weeklyLimit,
      remaining: usage.remaining,
      resetAt: usage.resetAt?.toISOString() || null,
      subscriptionTier: usage.subscriptionTier,
    });
  } catch (error) {
    return internalError(error, 'Failed to fetch AI usage');
  }
}
