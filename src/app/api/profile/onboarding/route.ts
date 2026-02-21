/**
 * Profile Onboarding API
 * POST /api/profile/onboarding — 標記用戶已完成 onboarding
 */

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { markOnboardingCompleted } from '@/infrastructure/repositories/profile.repository';

export async function POST() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please log in' } },
        { status: 401 }
      );
    }

    await markOnboardingCompleted(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/profile/onboarding error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
