// GET /api/posts/[id]/arguments - 取得文章論點

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getPostArguments } from '@/infrastructure/repositories/argument.repository';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const args = await getPostArguments(id);
    return NextResponse.json(args);
  } catch (err) {
    console.error('GET /api/posts/[id]/arguments', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch post arguments' },
      { status: 500 }
    );
  }
}
