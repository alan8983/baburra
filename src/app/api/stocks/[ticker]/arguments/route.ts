/**
 * 標的論點彙整 API
 * GET /api/stocks/[ticker]/arguments
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStockByTicker } from '@/infrastructure/repositories/stock.repository';
import {
  getStockArgumentSummary,
  getStockArguments,
  getArgumentCategories,
} from '@/infrastructure/repositories/argument.repository';

interface RouteParams {
  params: Promise<{ ticker: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { ticker } = await params;

    // 取得標的
    const stock = await getStockByTicker(ticker);
    if (!stock) {
      return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
    }

    // 取得論點彙整
    const summary = await getStockArgumentSummary(stock.id);

    // 取得所有論點（含詳情）
    const arguments_list = await getStockArguments(stock.id);

    // 取得類別階層資訊
    const categories = await getArgumentCategories();
    const parentCategories = categories.filter((c) => c.parentId === null);

    // 組織成階層結構
    const groupedSummary = parentCategories
      .map((parent) => {
        const childCategories = categories.filter((c) => c.parentId === parent.id);
        const childSummaries = childCategories
          .map((child) => {
            const summaryItem = summary.find((s) => s.categoryId === child.id);
            const categoryArguments = arguments_list.filter((a) => a.categoryId === child.id);

            return {
              category: {
                id: child.id,
                code: child.code,
                name: child.name,
                description: child.description,
              },
              mentionCount: summaryItem?.mentionCount || 0,
              bullishCount: summaryItem?.bullishCount || 0,
              bearishCount: summaryItem?.bearishCount || 0,
              avgSentiment: summaryItem?.avgSentiment || null,
              firstMentionedAt: summaryItem?.firstMentionedAt?.toISOString() || null,
              lastMentionedAt: summaryItem?.lastMentionedAt?.toISOString() || null,
              arguments: categoryArguments.map((a) => ({
                id: a.id,
                postId: a.postId,
                originalText: a.originalText,
                summary: a.summary,
                sentiment: a.sentiment,
                confidence: a.confidence,
                createdAt: a.createdAt.toISOString(),
              })),
            };
          })
          .filter((s) => s.mentionCount > 0);

        const totalMentions = childSummaries.reduce((sum, s) => sum + s.mentionCount, 0);

        return {
          parent: {
            id: parent.id,
            code: parent.code,
            name: parent.name,
          },
          totalMentions,
          children: childSummaries,
        };
      })
      .filter((g) => g.totalMentions > 0);

    return NextResponse.json({
      stock: {
        id: stock.id,
        ticker: stock.ticker,
        name: stock.name,
      },
      summary: groupedSummary,
      totalArgumentCount: arguments_list.length,
    });
  } catch (error) {
    console.error('Get stock arguments error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
