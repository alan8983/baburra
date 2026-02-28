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
import { unauthorizedError, errorResponse, internalError } from '@/lib/api/error';
import { createDraft, findKolByName } from '@/infrastructure/repositories';
import { consumeAiQuota } from '@/infrastructure/repositories/ai-usage.repository';
import { getUserTimezone } from '@/infrastructure/repositories/profile.repository';
import { analyzeDraftContent, extractArguments } from '@/domain/services/ai.service';
import type { IdentifiedTicker } from '@/domain/services/ai.service';
import { extractorFactory } from '@/infrastructure/extractors';
import { isUrlLike, getSupportedPlatform } from '@/lib/utils/url';
import type { CreateDraftInput, DraftAiArguments } from '@/domain/models';
import type { Sentiment } from '@/domain/models/post';
import { quickInputSchema, parseBody } from '@/lib/api/validation';

export async function POST(request: NextRequest) {
  try {
    // 1. 驗證身份
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    // 2. 解析請求
    const parsed = await parseBody(request, quickInputSchema);
    if ('error' in parsed) return parsed.error;
    const content = parsed.data.content;

    // 3. 原子性消耗 AI 配額（先扣再用，避免 race condition）
    try {
      await consumeAiQuota(userId);
    } catch (quotaErr) {
      if (
        quotaErr &&
        typeof quotaErr === 'object' &&
        'code' in quotaErr &&
        (quotaErr as { code: string }).code === 'AI_QUOTA_EXCEEDED'
      ) {
        return errorResponse(429, 'AI_QUOTA_EXCEEDED', 'AI quota exceeded');
      }
      throw quotaErr;
    }

    // 4. 偵測輸入類型
    const inputIsUrl = isUrlLike(content);
    const supportedPlatform = inputIsUrl ? getSupportedPlatform(content) : null;

    // 不支援的 URL → 直接回傳錯誤
    if (inputIsUrl && !supportedPlatform) {
      return errorResponse(400, 'UNSUPPORTED_URL', 'This URL platform is not supported');
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
        return errorResponse(400, code, message);
      }
    }

    // 5b. 取得用戶時區設定（用於 AI 日期解析）
    const timezone = await getUserTimezone(userId);

    // 6. AI 分析（若失敗仍建立草稿，只是缺少 AI 欄位）
    let aiKolName: string | null = null;
    let aiStockTickers: IdentifiedTicker[] = [];
    let aiStockNames: string[] = [];
    let aiSentiment: Sentiment | undefined;
    let aiStockSentiments: Record<string, Sentiment> | undefined;
    let aiPostedAt: Date | undefined;
    let aiAnalyzed = false;

    try {
      const analysis = await analyzeDraftContent(textContent, timezone);
      aiKolName = analysis.kolName;
      aiStockTickers = analysis.stockTickers;
      aiStockNames = analysis.stockTickers.map((t) => `${t.ticker} (${t.name})`);
      aiSentiment = analysis.sentiment;
      if (Object.keys(analysis.stockSentiments).length > 0) {
        aiStockSentiments = analysis.stockSentiments;
      }
      if (analysis.postedAt) {
        aiPostedAt = new Date(analysis.postedAt);
      }
      aiAnalyzed = true;
    } catch (aiError) {
      console.error('AI analysis failed, creating draft without AI fields:', aiError);
    }

    // 6b. 論點提取（若 AI 分析成功且有標的）— 並行呼叫以減少等待時間
    let aiArguments: DraftAiArguments[] | undefined;
    if (aiAnalyzed && aiStockTickers.length > 0) {
      try {
        const results = await Promise.allSettled(
          aiStockTickers.map((ticker) => extractArguments(textContent, ticker.ticker, ticker.name))
        );
        const argumentResults: DraftAiArguments[] = [];
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'fulfilled' && result.value.arguments.length > 0) {
            argumentResults.push({
              ticker: aiStockTickers[i].ticker,
              name: aiStockTickers[i].name,
              arguments: result.value.arguments,
            });
          } else if (result.status === 'rejected') {
            console.error(
              `Argument extraction failed for ${aiStockTickers[i].ticker}:`,
              result.reason
            );
          }
        }
        if (argumentResults.length > 0) {
          aiArguments = argumentResults;
        }
      } catch (argError) {
        console.error('Argument extraction failed, continuing without arguments:', argError);
      }
    }

    // 7. 嘗試匹配已存在的 KOL
    const kolNameInput = fetchedKolName || aiKolName || undefined;
    let matchedKolId: string | undefined;
    if (kolNameInput) {
      try {
        const matched = await findKolByName(kolNameInput);
        if (matched) {
          matchedKolId = matched.id;
        }
      } catch (matchError) {
        console.error('KOL name matching failed, continuing without kolId:', matchError);
      }
    }

    // 8. 合併資料 — URL 擷取的 metadata 優先
    const draftInput: CreateDraftInput = {
      content: textContent,
      sourceUrl,
      images,
      kolId: matchedKolId,
      kolNameInput,
      stockNameInputs: aiStockNames.length > 0 ? aiStockNames : undefined,
      sentiment: aiSentiment,
      stockSentiments: aiStockSentiments,
      postedAt: fetchedPostedAt || aiPostedAt || undefined,
      aiArguments,
    };

    // 9. 建立草稿
    const draft = await createDraft(userId, draftInput);

    // 10. 回傳結果（若未辨識到任何標的，附帶 warning）
    const warning = aiAnalyzed && aiStockTickers.length === 0 ? 'no_tickers_identified' : undefined;
    return NextResponse.json({ draft: { id: draft.id }, warning });
  } catch (error) {
    return internalError(error, 'Quick input failed');
  }
}
