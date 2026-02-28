/**
 * Profile Onboarding API
 * POST /api/profile/onboarding — 標記用戶已完成 onboarding
 */

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { markOnboardingCompleted } from '@/infrastructure/repositories/profile.repository';
import { unauthorizedError, internalError } from '@/lib/api/error';

export async function POST() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    await markOnboardingCompleted(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return internalError(error, 'Failed to complete onboarding');
  }
}
