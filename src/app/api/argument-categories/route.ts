/**
 * 論點類別列表 API
 * GET /api/argument-categories
 */

import { NextResponse } from 'next/server';
import { getArgumentCategories } from '@/infrastructure/repositories/argument.repository';

export async function GET() {
  try {
    const categories = await getArgumentCategories();

    // 將類別依階層組織
    const parentCategories = categories.filter((c) => c.parentId === null);
    const childCategories = categories.filter((c) => c.parentId !== null);

    const result = parentCategories.map((parent) => ({
      id: parent.id,
      code: parent.code,
      name: parent.name,
      description: parent.description,
      sortOrder: parent.sortOrder,
      children: childCategories
        .filter((c) => c.parentId === parent.id)
        .map((child) => ({
          id: child.id,
          code: child.code,
          name: child.name,
          description: child.description,
          sortOrder: child.sortOrder,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    })).sort((a, b) => a.sortOrder - b.sortOrder);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Get argument categories error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
