/**
 * Quick Input API — 一鍵建立草稿
 * POST /api/quick-input
 *
 * 接受文字或 URL，自動偵測類型後：
 * 1. 支援的 URL → 擷取內容 → AI 分析 → 建立草稿
 * 2. 不支援的 URL → 回傳錯誤
 * 3. 純文字 → AI 分析 → 建立草稿
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { createDraft } from '@/infrastructure/repositories';
import { checkAiQuota, consumeAiQuota } from '@/infrastructure/repositories/ai-usage.repository';
import { analyzeDraftContent, extractArguments } from '@/domain/services/ai.service';
import type { IdentifiedTicker } from '@/domain/services/ai.service';
import { extractorFactory } from '@/infrastructure/extractors';
import { isUrlLike, getSupportedPlatform } from '@/lib/utils/url';
import type { CreateDraftInput, DraftAiArguments } from '@/domain/models';
import type { Sentiment } from '@/domain/models/post';

interface QuickInputRequest {
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. 驗證身份
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please log in' } },
        { status: 401 }
      );
    }

    // 2. 解析請求
    const body = (await request.json()) as QuickInputRequest;
    const content = body.content?.trim();

    if (!content) {
      return NextResponse.json(
        { error: { code: 'EMPTY_CONTENT', message: 'Content is required' } },
        { status: 400 }
      );
    }

    // 3. 檢查 AI 配額
    const hasQuota = await checkAiQuota(userId);
    if (!hasQuota) {
      return NextResponse.json(
        { error: { code: 'AI_QUOTA_EXCEEDED', message: 'AI quota exceeded' } },
        { status: 429 }
      );
    }

    // 4. 偵測輸入類型
    const inputIsUrl = isUrlLike(content);
    const supportedPlatform = inputIsUrl ? getSupportedPlatform(content) : null;

    // 不支援的 URL → 直接回傳錯誤
    if (inputIsUrl && !supportedPlatform) {
      return NextResponse.json(
        { error: { code: 'UNSUPPORTED_URL', message: 'This URL platform is not supported' } },
        { status: 400 }
      );
    }

    // 5. 若為支援的 URL，先擷取內容
    let textContent = content;
    let sourceUrl: string | undefined;
    let images: string[] = [];
    let fetchedKolName: string | null = null;
    let fetchedPostedAt: Date | null = null;

    if (inputIsUrl && supportedPlatform) {
      try {
        const fetchResult = await extractorFactory.extractFromUrl(content);
        textContent = fetchResult.content;
        sourceUrl = fetchResult.sourceUrl;
        images = fetchResult.images || [];
        fetchedKolName = fetchResult.kolName || null;
        fetchedPostedAt = fetchResult.postedAt ? new Date(fetchResult.postedAt) : null;
      } catch (fetchError) {
        // URL 擷取失敗 → 回傳錯誤讓使用者改貼文字
        const code =
          fetchError && typeof fetchError === 'object' && 'code' in fetchError
            ? (fetchError as { code: string }).code
            : 'FETCH_FAILED';
        const message =
          fetchError && typeof fetchError === 'object' && 'message' in fetchError
            ? (fetchError as { message: string }).message
            : 'Failed to fetch URL content';
        return NextResponse.json({ error: { code, message } }, { status: 400 });
      }
    }

    // 6. AI 分析（若失敗仍建立草稿，只是缺少 AI 欄位）
    let aiKolName: string | null = null;
    let aiStockTickers: IdentifiedTicker[] = [];
    let aiStockNames: string[] = [];
    let aiSentiment: Sentiment | undefined;
    let aiPostedAt: Date | undefined;
    let aiAnalyzed = false;

    try {
      const analysis = await analyzeDraftContent(textContent);
      aiKolName = analysis.kolName;
      aiStockTickers = analysis.stockTickers;
      aiStockNames = analysis.stockTickers.map((t) => `${t.ticker} (${t.name})`);
      aiSentiment = analysis.sentiment;
      if (analysis.postedAt) {
        aiPostedAt = new Date(analysis.postedAt);
      }
      aiAnalyzed = true;
    } catch (aiError) {
      console.error('AI analysis failed, creating draft without AI fields:', aiError);
    }

    // 6b. 論點提取（若 AI 分析成功且有標的）
    let aiArguments: DraftAiArguments[] | undefined;
    if (aiAnalyzed && aiStockTickers.length > 0) {
      try {
        const argumentResults: DraftAiArguments[] = [];
        for (const ticker of aiStockTickers) {
          const result = await extractArguments(textContent, ticker.ticker, ticker.name);
          if (result.arguments.length > 0) {
            argumentResults.push({
              ticker: ticker.ticker,
              name: ticker.name,
              arguments: result.arguments,
            });
          }
        }
        if (argumentResults.length > 0) {
          aiArguments = argumentResults;
        }
      } catch (argError) {
        console.error('Argument extraction failed, continuing without arguments:', argError);
      }
    }

    // 7. 合併資料 — URL 擷取的 metadata 優先
    const draftInput: CreateDraftInput = {
      content: textContent,
      sourceUrl,
      images,
      kolNameInput: fetchedKolName || aiKolName || undefined,
      stockNameInputs: aiStockNames.length > 0 ? aiStockNames : undefined,
      sentiment: aiSentiment,
      postedAt: fetchedPostedAt || aiPostedAt || undefined,
      aiArguments,
    };

    // 8. 建立草稿
    const draft = await createDraft(userId, draftInput);

    // 9. 消耗 AI 配額（僅在 AI 實際執行時）
    if (aiAnalyzed) {
      await consumeAiQuota(userId);
    }

    // 10. 回傳結果
    return NextResponse.json({ draft: { id: draft.id } });
  } catch (error) {
    console.error('POST /api/quick-input error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}
