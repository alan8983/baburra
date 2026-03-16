/**
 * AI Credit Usage API
 * GET /api/ai/usage
 *
 * Returns both old (usageCount/remaining) and new (balance/weeklyLimit) shapes
 * for backward compatibility during the credit system migration.
 */

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getCreditInfo } from '@/infrastructure/repositories/ai-usage.repository';
import { unauthorizedError, internalError } from '@/lib/api/error';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    const info = await getCreditInfo(userId);

    return NextResponse.json({
      // New credit system fields
      balance: info.balance,
      weeklyLimit: info.weeklyLimit,
      resetAt: info.resetAt?.toISOString() || null,
      subscriptionTier: info.subscriptionTier,
      // Backward-compatible fields
      usageCount: info.weeklyLimit - info.balance,
      remaining: info.balance,
    });
  } catch (error) {
    return internalError(error, 'Failed to fetch credit info');
  }
}
