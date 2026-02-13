/**
 * AI Service - 情緒分析與論點提取
 */

import { generateJson } from '@/infrastructure/api/gemini.client';
import type { Sentiment } from '@/domain/models/post';

// =====================
// Types
// =====================

export interface SentimentAnalysisResult {
  sentiment: Sentiment;
  confidence: number;
  reasoning: string;
}

export interface IdentifiedTicker {
  ticker: string;
  name: string;
  market: 'US' | 'TW' | 'HK' | 'CRYPTO';
  confidence: number;
  mentionedAs: string;
}

export interface TickerIdentificationResult {
  tickers: IdentifiedTicker[];
}

export interface ArgumentCategory {
  code: string;
  name: string;
  description: string;
}

export interface ExtractedArgument {
  categoryCode: string;
  originalText: string;
  summary: string;
  sentiment: Sentiment;
  confidence: number;
}

export interface ArgumentExtractionResult {
  arguments: ExtractedArgument[];
}

export interface DraftAnalysisResult {
  kolName: string | null;
  stockTickers: IdentifiedTicker[];
  sentiment: Sentiment;
  confidence: number;
  reasoning: string;
  postedAt: string | null; // ISO 8601
}

// =====================
// Prompts
// =====================

const SENTIMENT_ANALYSIS_PROMPT = `
分析以下投資相關文章，判斷作者對提及的投資標的的看法。

文章內容:
{content}

請以 JSON 格式回傳:
{
  "sentiment": <-2 到 2 的整數>,
  "confidence": <0 到 1 的小數>,
  "reasoning": "<簡短說明判斷理由>"
}

sentiment 數值對應:
- 2: 強烈看多 (明確表示非常看好，建議買入)
- 1: 看多 (正面評價，認為會上漲)
- 0: 中立 (沒有明確方向性判斷)
- -1: 看空 (負面評價，認為會下跌)
- -2: 強烈看空 (明確表示非常不看好，建議賣出)

只回傳 JSON，不要有其他文字。
`;

const ARGUMENT_EXTRACTION_PROMPT = `
分析以下投資文章，依據指定的分析框架，提取作者提出的論點。

文章內容:
{content}

投資標的:
{ticker} - {stockName}

分析框架類別:
{frameworkCategories}

請以 JSON 格式回傳找到的論點:
{
  "arguments": [
    {
      "categoryCode": "<框架類別代碼>",
      "originalText": "<原文摘錄 (最多 200 字)>",
      "summary": "<論點摘要 (一句話)>",
      "sentiment": <-2 到 2，此論點的看多/看空程度>,
      "confidence": <0 到 1>
    }
  ]
}

注意事項:
1. 只提取文章中明確提及的論點，不要推測
2. 每個論點需對應到框架中的類別
3. 如果文章沒有提到某類別，不需要硬填
4. sentiment 數值: 2(強烈看多), 1(看多), 0(中立), -1(看空), -2(強烈看空)

只回傳 JSON，不要有其他文字。
`;

const DRAFT_ANALYSIS_PROMPT = `
你是一個投資文章分析助手。請分析以下投資相關文章，一次提取所有關鍵資訊。

今天的日期是: {today}

文章內容:
{content}

請以 JSON 格式回傳:
{
  "kolName": "<發文者/作者名稱，若無法判斷則為 null>",
  "tickers": [
    {
      "ticker": "<標準代碼，如 AAPL、2330.TW、BTC>",
      "name": "<標的全名>",
      "market": "<市場: US / TW / HK / CRYPTO>",
      "confidence": <0 到 1 的小數>,
      "mentionedAs": "<文章中出現的原始文字>"
    }
  ],
  "sentiment": <-2 到 2 的整數>,
  "confidence": <0 到 1 的小數>,
  "reasoning": "<簡短說明判斷理由>",
  "postedAt": "<發文時間的 ISO 8601 格式，若無法判斷則為 null>"
}

提取規則:
1. KOL 名稱：文章開頭通常會出現發文者名稱（如「XXX 表示」、「@XXX」、暱稱等），請仔細辨識
2. 投資標的識別：
   - 支援英文代碼 (如 AAPL, TSLA, NVDA)
   - 支援中文名稱 (如 台積電、鴻海、蘋果) 並轉換為標準代碼
   - 支援台股代碼 (如 2330、2317)，台股代碼請加上 .TW 後綴
   - 支援港股代碼 (如 0700.HK、9988.HK)
   - 支援加密貨幣 (如 BTC、ETH)
   - 如果文章沒有提及任何標的，回傳空陣列
   - 不要猜測，只識別文章中明確提及的標的
3. 情緒判斷 (sentiment):
   - 2: 強烈看多 (明確表示非常看好，建議買入)
   - 1: 看多 (正面評價，認為會上漲)
   - 0: 中立 (沒有明確方向性判斷)
   - -1: 看空 (負面評價，認為會下跌)
   - -2: 強烈看空 (明確表示非常不看好，建議賣出)
4. 發文時間：文章中若有提及日期時間（如「2024/1/15」、「今天」、「昨天」、「3小時前」），請根據今天日期轉換為 ISO 8601 格式。若無法判斷則回傳 null

只回傳 JSON，不要有其他文字。
`;

const TICKER_IDENTIFICATION_PROMPT = `
分析以下投資相關文章，找出所有提及的投資標的（股票、ETF、加密貨幣等）。

文章內容:
{content}

請以 JSON 格式回傳所有識別到的投資標的:
{
  "tickers": [
    {
      "ticker": "<標準代碼，如 AAPL、2330.TW、BTC>",
      "name": "<標的全名>",
      "market": "<市場: US / TW / HK / CRYPTO>",
      "confidence": <0 到 1 的小數>,
      "mentionedAs": "<文章中出現的原始文字>"
    }
  ]
}

識別規則:
1. 支援英文代碼 (如 AAPL, TSLA, NVDA)
2. 支援中文名稱 (如 台積電、鴻海、蘋果)
3. 支援台股代碼 (如 2330、2317)，台股代碼請加上 .TW 後綴
4. 支援港股代碼 (如 0700.HK、9988.HK)
5. 支援加密貨幣 (如 BTC、ETH)
6. 如果文章沒有提及任何標的，回傳空陣列
7. 不要猜測，只識別文章中明確提及的標的

只回傳 JSON，不要有其他文字。
`;

// =====================
// Framework Categories (依 ANALYSIS_FRAMEWORK.md)
// =====================

const FRAMEWORK_CATEGORIES: ArgumentCategory[] = [
  // 量化
  {
    code: 'FINANCIALS',
    name: '財務體質',
    description: '公司的成長率、利潤率等財報內部資訊',
  },
  {
    code: 'MOMENTUM',
    name: '動能類',
    description: '價格的成長與交易量，技術分析相關',
  },
  {
    code: 'VALUATION',
    name: '估值',
    description: '股價與交易乘數（如 PE 倍數、EV/EBITDA 倍數等）',
  },
  // 質化
  {
    code: 'MARKET_SIZE',
    name: '市場規模',
    description: '公司所在賽道、可觸及市場（TAM）規模、市場 CAGR',
  },
  {
    code: 'MOAT',
    name: '護城河',
    description: '技術、規模、許可、專利等競爭優勢',
  },
  {
    code: 'OPERATIONAL_QUALITY',
    name: '營運品質',
    description: '與同業比較的利潤率，從護城河或商業模式出發',
  },
  // 催化劑
  {
    code: 'CATALYST',
    name: '催化劑',
    description: '財報、Fed動向、FDA審批等特定時間點事件',
  },
];

// =====================
// Service Functions
// =====================

/**
 * 分析文章情緒
 */
export async function analyzeSentiment(content: string): Promise<SentimentAnalysisResult> {
  const prompt = SENTIMENT_ANALYSIS_PROMPT.replace('{content}', content);

  const result = await generateJson<SentimentAnalysisResult>(prompt, {
    temperature: 0.3, // 較低溫度以獲得更一致的結果
    maxOutputTokens: 512,
  });

  // 確保 sentiment 在有效範圍內
  const sentiment = Math.max(-2, Math.min(2, Math.round(result.sentiment))) as Sentiment;

  return {
    sentiment,
    confidence: Math.max(0, Math.min(1, result.confidence)),
    reasoning: result.reasoning || '',
  };
}

/**
 * 提取文章論點
 */
export async function extractArguments(
  content: string,
  ticker: string,
  stockName: string
): Promise<ArgumentExtractionResult> {
  // 格式化框架類別供 prompt 使用
  const frameworkText = FRAMEWORK_CATEGORIES.map(
    (cat) => `- ${cat.code} (${cat.name}): ${cat.description}`
  ).join('\n');

  const prompt = ARGUMENT_EXTRACTION_PROMPT.replace('{content}', content)
    .replace('{ticker}', ticker)
    .replace('{stockName}', stockName)
    .replace('{frameworkCategories}', frameworkText);

  const result = await generateJson<ArgumentExtractionResult>(prompt, {
    temperature: 0.3,
    maxOutputTokens: 2048,
  });

  // 驗證並清理結果
  const validatedArguments = (result.arguments || [])
    .filter((arg) => {
      // 確保 categoryCode 是有效的
      return FRAMEWORK_CATEGORIES.some((cat) => cat.code === arg.categoryCode);
    })
    .map((arg) => ({
      categoryCode: arg.categoryCode,
      originalText: (arg.originalText || '').slice(0, 500),
      summary: (arg.summary || '').slice(0, 200),
      sentiment: Math.max(-2, Math.min(2, Math.round(arg.sentiment))) as Sentiment,
      confidence: Math.max(0, Math.min(1, arg.confidence || 0.5)),
    }));

  return { arguments: validatedArguments };
}

/**
 * 識別文章中提及的投資標的
 */
export async function identifyTickers(content: string): Promise<TickerIdentificationResult> {
  const prompt = TICKER_IDENTIFICATION_PROMPT.replace('{content}', content);

  const result = await generateJson<TickerIdentificationResult>(prompt, {
    temperature: 0.2,
    maxOutputTokens: 1024,
  });

  const validMarkets = ['US', 'TW', 'HK', 'CRYPTO'];
  const tickers = (result.tickers || [])
    .filter((t) => t.ticker && t.name && validMarkets.includes(t.market))
    .map((t) => ({
      ticker: t.ticker.trim().toUpperCase(),
      name: t.name.trim(),
      market: t.market as IdentifiedTicker['market'],
      confidence: Math.max(0, Math.min(1, t.confidence || 0.5)),
      mentionedAs: (t.mentionedAs || t.name).slice(0, 100),
    }));

  return { tickers };
}

/**
 * 綜合分析草稿內容 — 一次提取 KOL、標的、情緒、發文時間
 */
export async function analyzeDraftContent(content: string): Promise<DraftAnalysisResult> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const prompt = DRAFT_ANALYSIS_PROMPT.replace('{content}', content).replace('{today}', today);

  interface RawDraftAnalysis {
    kolName: string | null;
    tickers: Array<{
      ticker: string;
      name: string;
      market: string;
      confidence: number;
      mentionedAs: string;
    }>;
    sentiment: number;
    confidence: number;
    reasoning: string;
    postedAt: string | null;
  }

  const result = await generateJson<RawDraftAnalysis>(prompt, {
    temperature: 0.3,
    maxOutputTokens: 1024,
  });

  // 驗證並清理 tickers
  const validMarkets = ['US', 'TW', 'HK', 'CRYPTO'];
  const stockTickers: IdentifiedTicker[] = (result.tickers || [])
    .filter((t) => t.ticker && t.name && validMarkets.includes(t.market))
    .map((t) => ({
      ticker: t.ticker.trim().toUpperCase(),
      name: t.name.trim(),
      market: t.market as IdentifiedTicker['market'],
      confidence: Math.max(0, Math.min(1, t.confidence || 0.5)),
      mentionedAs: (t.mentionedAs || t.name).slice(0, 100),
    }));

  // 驗證 sentiment
  const sentiment = Math.max(-2, Math.min(2, Math.round(result.sentiment || 0))) as Sentiment;

  // 驗證 postedAt
  let postedAt: string | null = null;
  if (result.postedAt) {
    const parsed = new Date(result.postedAt);
    if (!isNaN(parsed.getTime())) {
      postedAt = parsed.toISOString();
    }
  }

  return {
    kolName: result.kolName?.trim() || null,
    stockTickers,
    sentiment,
    confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
    reasoning: result.reasoning || '',
    postedAt,
  };
}

/**
 * 取得框架類別列表
 */
export function getFrameworkCategories(): ArgumentCategory[] {
  return FRAMEWORK_CATEGORIES;
}

/**
 * 根據 code 取得框架類別
 */
export function getCategoryByCode(code: string): ArgumentCategory | undefined {
  return FRAMEWORK_CATEGORIES.find((cat) => cat.code === code);
}
