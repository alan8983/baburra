/**
 * Profile API
 * GET  /api/profile — 取得當前用戶個人資料
 * PATCH /api/profile — 更新當前用戶個人資料
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getProfile, updateProfile } from '@/infrastructure/repositories/profile.repository';
import { unauthorizedError, internalError } from '@/lib/api/error';
import { updateProfileSchema, parseBody } from '@/lib/api/validation';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    const profile = await getProfile(userId);
    return NextResponse.json(profile);
  } catch (error) {
    return internalError(error, 'Failed to fetch profile');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    const parsed = await parseBody(request, updateProfileSchema);
    if ('error' in parsed) return parsed.error;

    await updateProfile(userId, parsed.data);

    const updated = await getProfile(userId);
    return NextResponse.json(updated);
  } catch (error) {
    return internalError(error, 'Failed to update profile');
  }
}
