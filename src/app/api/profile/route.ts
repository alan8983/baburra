/**
 * Profile API
 * GET  /api/profile — 取得當前用戶個人資料
 * PATCH /api/profile — 更新當前用戶個人資料
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getProfile, updateProfile } from '@/infrastructure/repositories/profile.repository';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please log in' } },
        { status: 401 }
      );
    }

    const profile = await getProfile(userId);
    return NextResponse.json(profile);
  } catch (error) {
    console.error('GET /api/profile error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please log in' } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { displayName, timezone } = body as {
      displayName?: string;
      timezone?: string;
    };

    await updateProfile(userId, { displayName, timezone });

    const updated = await getProfile(userId);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/profile error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
