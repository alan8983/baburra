// GET /api/kols - 列表（支援 search, page, limit）
// POST /api/kols - 新增 KOL

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { listKols, createKol } from '@/infrastructure/repositories';
import { parsePaginationParams } from '@/lib/api/pagination';
import { unauthorizedError, badRequestError, internalError } from '@/lib/api/error';
import { createKolSchema, parseBody } from '@/lib/api/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? undefined;
    const validationStatus = searchParams.get('validationStatus') ?? undefined;
    const pagination = parsePaginationParams(searchParams);
    if (pagination.error) {
      return badRequestError(pagination.error);
    }

    // Validate validationStatus param
    const validStatuses = ['pending', 'validating', 'active', 'rejected', 'all'];
    if (validationStatus && !validStatuses.includes(validationStatus)) {
      return badRequestError(
        `Invalid validationStatus. Must be one of: ${validStatuses.join(', ')}`
      );
    }

    const result = await listKols({
      search: search || undefined,
      page: pagination.data?.page,
      limit: pagination.data?.limit,
      validationStatus:
        (validationStatus as 'pending' | 'validating' | 'active' | 'rejected' | 'all') ?? 'active',
    });
    return NextResponse.json(result);
  } catch (err) {
    return internalError(err, 'Failed to fetch KOLs');
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }
    const parsed = await parseBody(request, createKolSchema);
    if ('error' in parsed) return parsed.error;
    const kol = await createKol(parsed.data);
    return NextResponse.json(kol);
  } catch (err) {
    return internalError(err, 'Failed to create KOL');
  }
}
