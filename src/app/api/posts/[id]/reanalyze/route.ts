// POST /api/posts/[id]/reanalyze — re-run AI analysis on a single post

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getPostById, updatePostAiAnalysis } from '@/infrastructure/repositories/post.repository';
import { getUserTimezone } from '@/infrastructure/repositories/profile.repository';
import { analyzeDraftContent, extractArguments } from '@/domain/services/ai.service';
import { getAiModelVersion } from '@/infrastructure/api/gemini.client';
import { replacePostArguments } from '@/infrastructure/repositories/argument.repository';
import { unauthorizedError, notFoundError, internalError } from '@/lib/api/error';
import type { Sentiment } from '@/domain/models/post';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const { id } = await params;
    const post = await getPostById(id);
    if (!post) return notFoundError('Post');

    // Re-run AI analysis (no quota consumption — platform maintenance operation)
    const timezone = await getUserTimezone(userId);
    const analysis = await analyzeDraftContent(post.content, timezone);

    // Build per-stock sentiments mapped by stockId
    const stockSentiments: Record<string, number> = {};
    if (analysis.stockSentiments) {
      for (const stock of post.stocks) {
        const tickerSentiment = analysis.stockSentiments[stock.ticker.toUpperCase()];
        if (tickerSentiment !== undefined) {
          stockSentiments[stock.id] = tickerSentiment;
        }
      }
    }

    // Update post
    const updated = await updatePostAiAnalysis(id, {
      sentiment: analysis.sentiment,
      aiModelVersion: getAiModelVersion(),
      stockSentiments: Object.keys(stockSentiments).length > 0 ? stockSentiments : undefined,
    });

    if (!updated) return notFoundError('Post');

    // Re-extract arguments (same pattern as import pipeline)
    try {
      if (post.stocks.length > 0) {
        const results = await Promise.allSettled(
          post.stocks.map((stock) => extractArguments(post.content, stock.ticker, stock.name))
        );

        const allArgs: {
          stockId: string;
          categoryCode: string;
          originalText: string;
          summary: string;
          sentiment: Sentiment;
          confidence: number;
        }[] = [];

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'fulfilled' && result.value.arguments.length > 0) {
            for (const arg of result.value.arguments) {
              allArgs.push({
                stockId: post.stocks[i].id,
                categoryCode: arg.categoryCode,
                originalText: arg.originalText,
                summary: arg.summary,
                sentiment: arg.sentiment,
                confidence: arg.confidence,
              });
            }
          }
        }

        await replacePostArguments(id, allArgs);
      }
    } catch (argErr) {
      console.error('Argument re-extraction failed:', argErr);
    }

    return NextResponse.json({
      ...updated,
      aiModelVersion: updated.aiModelVersion,
      sentiment: updated.sentiment as Sentiment,
    });
  } catch (err) {
    return internalError(err, 'Failed to re-analyze post');
  }
}
