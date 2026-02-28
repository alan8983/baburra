/**
 * 論點類別列表 API
 * GET /api/ai/categories
 */

import { NextResponse } from 'next/server';
import { getArgumentCategories } from '@/infrastructure/repositories/argument.repository';
import { internalError } from '@/lib/api/error';

export async function GET() {
  try {
    const categories = await getArgumentCategories();

    // 將類別依階層組織
    const parentCategories = categories.filter((c) => c.parentId === null);
    const childCategories = categories.filter((c) => c.parentId !== null);

    const result = parentCategories.map((parent) => ({
      ...parent,
      children: childCategories.filter((c) => c.parentId === parent.id),
    }));

    return NextResponse.json(result);
  } catch (error) {
    return internalError(error, 'Failed to fetch argument categories');
  }
}
