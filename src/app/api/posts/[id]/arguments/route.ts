// GET /api/posts/[id]/arguments - 取得文章論點

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getPostArguments } from '@/infrastructure/repositories/argument.repository';
import { unauthorizedError, internalError } from '@/lib/api/error';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    const { id } = await params;
    const args = await getPostArguments(id);
    return NextResponse.json(args);
  } catch (err) {
    return internalError(err, 'Failed to fetch post arguments');
  }
}
