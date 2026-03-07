// POST /api/posts/reanalyze-batch — re-run AI analysis on multiple posts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getPostById, updatePostAiAnalysis } from '@/infrastructure/repositories/post.repository';
import { getUserTimezone } from '@/infrastructure/repositories/profile.repository';
import { analyzeDraftContent } from '@/domain/services/ai.service';
import { getAiModelVersion } from '@/infrastructure/api/gemini.client';
import { unauthorizedError, internalError } from '@/lib/api/error';
import { parseBody } from '@/lib/api/validation';

const batchReanalyzeSchema = z.object({
  postIds: z.array(z.string().uuid()).min(1).max(10),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const parsed = await parseBody(request, batchReanalyzeSchema);
    if ('error' in parsed) return parsed.error;

    const { postIds } = parsed.data;
    const timezone = await getUserTimezone(userId);
    const modelVersion = getAiModelVersion();

    let success = 0;
    let failed = 0;

    for (const postId of postIds) {
      try {
        const post = await getPostById(postId);
        if (!post) {
          failed++;
          continue;
        }

        // No quota consumption — platform maintenance operation
        const analysis = await analyzeDraftContent(post.content, timezone);

        const stockSentiments: Record<string, number> = {};
        if (analysis.stockSentiments) {
          for (const stock of post.stocks) {
            const tickerSentiment = analysis.stockSentiments[stock.ticker.toUpperCase()];
            if (tickerSentiment !== undefined) {
              stockSentiments[stock.id] = tickerSentiment;
            }
          }
        }

        await updatePostAiAnalysis(postId, {
          sentiment: analysis.sentiment,
          aiModelVersion: modelVersion,
          stockSentiments: Object.keys(stockSentiments).length > 0 ? stockSentiments : undefined,
        });

        success++;
      } catch (err) {
        console.error(`Reanalyze failed for post ${postId}:`, err);
        failed++;
      }
    }

    return NextResponse.json({ success, failed });
  } catch (err) {
    return internalError(err, 'Failed to batch re-analyze posts');
  }
}
