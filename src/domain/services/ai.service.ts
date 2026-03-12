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
  stockSentiments: Record<string, Sentiment>; // ticker -> per-stock sentiment
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
  "sentiment": <-3 到 3 的整數>,
  "confidence": <0 到 1 的小數>,
  "reasoning": "<簡短說明判斷理由>"
}

sentiment 數值對應:
- 3: 強烈看多 (明確表示非常看好，建議買入，語氣極為堅定)
- 2: 看多 (正面評價，認為會上漲)
- 1: 略微看多 (稍微偏正面，但不夠明確)
- 0: 中立 (沒有明確方向性判斷)
- -1: 略微看空 (稍微偏負面，但不夠明確)
- -2: 看空 (負面評價，認為會下跌)
- -3: 強烈看空 (明確表示非常不看好，建議賣出，語氣極為堅定)

只回傳 JSON，不要有其他文字。
`;

const ARGUMENT_EXTRACTION_PROMPT = `
You are a professional investment analyst. Analyze the article below and extract the most important arguments the author makes about the specified stock, mapped to the provided analysis framework.

Article:
{content}

Stock:
{ticker} - {stockName}

Analysis Framework Categories:
{frameworkCategories}

Extraction rules:
1. Extract 1–5 arguments. Never return more than 5.
2. Per category: at most 3 arguments. Prioritize the highest-confidence ones.
3. Spread across categories: the combined set of arguments should collectively cover as many distinct investment angles from the article as possible. Do not let any single category dominate.
4. Only extract points explicitly stated in the article — do not infer or speculate.
5. Sentiment scale: 3 (strongly bullish), 2 (bullish), 1 (slightly bullish), 0 (neutral), -1 (slightly bearish), -2 (bearish), -3 (strongly bearish).

Quality signal: Award higher confidence to arguments that are clear, precise, and insightful — especially those that include specific numbers, comparisons, or a unique perspective.

Return JSON only:
{
  "arguments": [
    {
      "categoryCode": "<framework category code>",
      "originalText": "<verbatim excerpt from article, max 200 chars>",
      "summary": "<one crisp sentence summarizing the argument>",
      "sentiment": <-3 to 3>,
      "confidence": <0.0 to 1.0>
    }
  ]
}
`;

function buildRevisionPrompt(
  content: string,
  ticker: string,
  stockName: string,
  previousArgs: ExtractedArgument[]
): string {
  const n = previousArgs.length;
  const previousArgsJson = JSON.stringify(previousArgs, null, 2);
  return `You extracted ${n} arguments from the article. That is too many — the result feels scattered and loses focus. A strong analysis highlights only the most important, high-conviction arguments.

Original article:
${content}

Stock: ${ticker} - ${stockName}

Your previous extraction:
${previousArgsJson}

Please revise: select at most 5 arguments total, with at most 3 per category. Keep the clearest, most insightful ones that collectively cover the broadest range of investment angles from the article. Remove duplicates and low-value points. Do not let a single category dominate.

Quality signal: arguments with specific numbers, comparisons, or unique insight deserve higher confidence scores.

Return JSON only, same format as before:
{
  "arguments": [...]
}`;
}

/**
 * Apply hard caps to extracted arguments:
 * - Max 3 per category (highest confidence kept)
 * - Max 5 total (highest confidence kept)
 */
export function applyHardCaps(args: ExtractedArgument[]): ExtractedArgument[] {
  // Group by category
  const grouped = new Map<string, ExtractedArgument[]>();
  for (const arg of args) {
    const group = grouped.get(arg.categoryCode) ?? [];
    group.push(arg);
    grouped.set(arg.categoryCode, group);
  }

  // Cap each category at 3 (highest confidence first)
  const capped = Array.from(grouped.values()).flatMap((group) =>
    group.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
  );

  // Cap total at 5 (highest confidence first)
  return capped.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

function buildDraftAnalysisPrompt(timezone: string): string {
  return `
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
  "sentiment": <-3 到 3 的整數>,
  "stockSentiments": {
    "<標準代碼>": <-3 到 3 的整數>
  },
  "confidence": <0 到 1 的小數>,
  "reasoning": "<簡短說明判斷理由>",
  "postedAt": "<發文時間的 ISO 8601 格式，若無法判斷則為 null>"
}

提取規則:
1. KOL 名稱：請辨識文章中的發文者/作者名稱。常見模式包括：
   - 社群媒體貼文格式：名稱出現在文章最開頭（第一行），後面接「追蹤」、日期等
   - 引述格式：「XXX 表示」、「XXX 認為」、「XXX 指出」
   - 帳號格式：@handle
   - 若文章開頭有 [系統提示] 標記預提取的 KOL 名稱，請優先使用該名稱
2. 投資標的識別：
   - 只回傳文章「主要討論」的投資標的，即作者表達投資觀點的對象
   - 不要回傳僅用於比較、參考、或背景說明的指數與標的（例如：「NVDA 跑贏 S&P 500」中，S&P 500 / SPY / ^GSPC 只是比較基準，不應列入）
   - 常見的比較基準包括但不限於：S&P 500、NASDAQ、道瓊、SPY、QQQ、DIA、IWM、VTI、VOO、加權指數、大盤等
   - 支援英文代碼 (如 AAPL, TSLA, NVDA)
   - 支援中文名稱並轉換為標準代碼，常見對應：
     美股：特斯拉→TSLA、蘋果→AAPL、輝達/英偉達→NVDA、微軟→MSFT、亞馬遜→AMZN、谷歌/Google→GOOGL、Meta→META
     台股：台積電→2330.TW、鴻海→2317.TW、聯發科→2454.TW
     港股：騰訊→0700.HK、阿里巴巴→9988.HK、比亞迪→1211.HK、小米→1810.HK
   - 支援台股代碼 (如 2330、2317)，台股代碼請加上 .TW 後綴
   - 支援港股代碼 (如 0700.HK、9988.HK)
   - 支援加密貨幣 (如 BTC、ETH)
   - 中文名稱（如「特斯拉」、「蘋果」、「比亞迪」）就是明確提及的標的，應轉換為對應的標準代碼
   - ⚠️ 本平台僅支援以下市場的行情資料：US（美股）、TW（台股）、HK（港股）、CRYPTO（加密貨幣）
   - 如果某公司同時在多個交易所上市（例如：Mercado Libre 在巴西為 MELI34/MELID，在美國為 MELI），請務必使用支援市場的代碼（優先美股）
   - 不要回傳不支援市場的代碼（例如：巴西 B3、倫敦 LSE、東京 TSE、韓國 KRX、印度 BSE 等）
   - 自我檢查：回傳前請逐一確認每個 ticker 確實在所標示的市場（US/TW/HK/CRYPTO）上交易，若有誤請修正為正確的支援市場代碼
   - 如果文章沒有提及任何標的，回傳空陣列
3. 情緒判斷 (sentiment):
   - 3: 強烈看多 (明確表示非常看好，建議買入，語氣極為堅定)
   - 2: 看多 (正面評價，認為會上漲)
   - 1: 略微看多 (稍微偏正面，但不夠明確)
   - 0: 中立 (沒有明確方向性判斷)
   - -1: 略微看空 (稍微偏負面，但不夠明確)
   - -2: 看空 (負面評價，認為會下跌)
   - -3: 強烈看空 (明確表示非常不看好，建議賣出，語氣極為堅定)
   - sentiment 代表整體情緒
4. 個股情緒 (stockSentiments):
   - 如果文章提到多個標的，且作者對不同標的有不同看法，請為每個標的提供個別的情緒分數
   - key 使用標準代碼（如 AAPL、2330.TW），需與 tickers 中的 ticker 一致
   - value 使用與 sentiment 相同的 -3 到 3 整數
   - 如果所有標的情緒相同，仍需填入 stockSentiments
   - 若只有一個標的，stockSentiments 可以只包含該標的
5. 發文時間：文章中若有提及日期時間，請轉換為 ISO 8601 格式。支援的格式包括：
   - 西式日期：「2024/1/15」、「2024-01-15」
   - 中文日期：「2025年3月21日」、「3月21日」
   - 相對時間：「今天」、「昨天」、「前天」、「3小時前」、「2天前」
   請根據今天日期計算相對時間。所有時間請視為 ${timezone} 時區。若無法判斷則回傳 null

只回傳 JSON，不要有其他文字。
`;
}

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
1. 只回傳文章「主要討論」的投資標的，即作者表達投資觀點的對象
2. 不要回傳僅用於比較、參考、或背景說明的指數與標的（例如：「NVDA 跑贏 S&P 500」中，S&P 500 / SPY / ^GSPC 只是比較基準，不應列入）
3. 常見的比較基準包括但不限於：S&P 500、NASDAQ、道瓊、SPY、QQQ、DIA、IWM、VTI、VOO、加權指數、大盤等
4. 支援英文代碼 (如 AAPL, TSLA, NVDA)
5. 支援中文名稱 (如 台積電、鴻海、蘋果)
6. 支援台股代碼 (如 2330、2317)，台股代碼請加上 .TW 後綴
7. 支援港股代碼 (如 0700.HK、9988.HK)
8. 支援加密貨幣 (如 BTC、ETH)
9. 如果文章沒有提及任何標的，回傳空陣列
10. 不要猜測，只識別文章中明確提及的標的
11. ⚠️ 本平台僅支援：US（美股）、TW（台股）、HK（港股）、CRYPTO（加密貨幣）的行情資料
12. 如果某公司同時在多個交易所上市，請優先使用美股代碼（例如：Mercado Libre → MELI，不要用巴西的 MELI34 或 MELID）
13. 不要回傳不支援市場的代碼（巴西 B3、倫敦 LSE、東京 TSE、韓國 KRX、印度 BSE 等）
14. 自我檢查：回傳前逐一確認每個 ticker 在所標示的市場上確實存在且可交易

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
// Pre-extraction (deterministic fallbacks)
// =====================

/**
 * Regex-based extraction of @handle patterns from text.
 * Returns deduplicated handles preserving original casing (e.g. ['bodoxstocks', 'SharkChart']).
 * Matches @ followed by alphanumeric/underscore characters (standard social-media handle format).
 */
export function extractAtHandles(content: string): string[] {
  const regex = /@([A-Za-z0-9_]{2,30})\b/g;
  const found = new Set<string>();
  let match;
  while ((match = regex.exec(content)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}

/**
 * Regex-based extraction of $TICKER cashtag patterns from text.
 * Returns deduplicated uppercase ticker symbols (e.g. ['ONDS', 'AAPL']).
 * Only matches 1-6 uppercase letter tickers, excluding dollar amounts like $10,000.
 */
export function extractCashtags(content: string): string[] {
  const regex = /\$([A-Z]{1,6})\b/g;
  const found = new Set<string>();
  let match;
  while ((match = regex.exec(content)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}

/**
 * Well-known benchmark/index tickers that are typically used for comparison,
 * not as the primary subject of an investment thesis.
 * These are excluded from regex-based cashtag fallback to avoid noise.
 */
export const BENCHMARK_TICKERS = new Set([
  // US major indices & index ETFs
  'SPY',
  'SPX',
  'QQQ',
  'DIA',
  'IWM',
  'VTI',
  'VOO',
  'IVV',
  'RSP',
  'VT',
  // US bond / volatility
  'TLT',
  'VIX',
  // Sector-wide ETFs commonly used as benchmarks
  'XLF',
  'XLK',
  'XLE',
  'XLV',
  'XLI',
  'XLU',
  'XLP',
  'XLY',
  'XLB',
  'XLRE',
  'XLC',
  // International index ETFs
  'EEM',
  'EFA',
  'VWO',
  'FXI',
]);

/**
 * Check if a ticker is a well-known benchmark/index.
 */
export function isBenchmarkTicker(ticker: string): boolean {
  return BENCHMARK_TICKERS.has(ticker);
}

/**
 * Merge AI-identified tickers with regex-extracted cashtags.
 * AI results take priority (richer metadata); regex fills in any the AI missed.
 * Benchmark/index tickers from regex are excluded when other specific tickers exist,
 * to avoid treating comparison references as investment subjects.
 */
function mergeWithCashtags(aiTickers: IdentifiedTicker[], content: string): IdentifiedTicker[] {
  const cashtags = extractCashtags(content);
  if (cashtags.length === 0) return aiTickers;

  const aiTickerSet = new Set(aiTickers.map((t) => t.ticker));
  const merged = [...aiTickers];

  const nonBenchmarkCashtags = cashtags.filter((t) => !isBenchmarkTicker(t));
  const hasSpecificTickers = aiTickers.length > 0 || nonBenchmarkCashtags.length > 0;

  for (const tag of cashtags) {
    if (aiTickerSet.has(tag)) continue;
    // Skip benchmark tickers when specific tickers exist (they're likely comparisons)
    if (isBenchmarkTicker(tag) && hasSpecificTickers) continue;
    merged.push({
      ticker: tag,
      name: tag,
      market: 'US',
      confidence: 0.7,
      mentionedAs: `$${tag}`,
    });
  }

  return merged;
}

// =====================
// Social Media Paste Detection
// =====================

export interface SocialMediaMeta {
  kolName: string | null;
  postedAt: string | null; // raw date string from header
  platform: 'facebook' | 'threads' | 'unknown' | null;
}

/**
 * Detect social-media-pasted text patterns and extract structured metadata.
 *
 * Facebook paste pattern:
 *   KOL名稱
 *   [· | 空行]
 *   追蹤
 *   YYYY年M月D日
 *   ·
 *   文章內容...
 *
 * Threads paste pattern:
 *   KOL名稱
 *   @handle
 *   追蹤
 *   內容...
 */
export function extractSocialMediaMeta(content: string): SocialMediaMeta {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 3) {
    return { kolName: null, postedAt: null, platform: null };
  }

  const firstLine = lines[0];
  // First line should look like a name: 2-30 chars, no URL, not a sentence
  const isShortName = firstLine.length >= 2 && firstLine.length <= 30;
  const hasNoUrl = !/https?:\/\//.test(firstLine);
  const isNotSentence = firstLine.length <= 20 || !/[。，！？；：]/.test(firstLine);

  if (!isShortName || !hasNoUrl || !isNotSentence) {
    return { kolName: null, postedAt: null, platform: null };
  }

  // Look for "追蹤" / "Follow" / "·" in lines 1-4 (social media header indicators)
  const headerLines = lines.slice(1, Math.min(6, lines.length));
  const hasFollowIndicator = headerLines.some((l) => l === '追蹤' || l === 'Follow' || l === '·');

  if (!hasFollowIndicator) {
    return { kolName: null, postedAt: null, platform: null };
  }

  // Extract Chinese date from header area
  let postedAt: string | null = null;
  const chineseDateRegex = /(\d{4})年(\d{1,2})月(\d{1,2})日/;
  for (const line of headerLines) {
    const match = line.match(chineseDateRegex);
    if (match) {
      postedAt = line;
      break;
    }
  }

  // Detect platform: threads if @handle present in header
  const hasAtHandle = headerLines.some((l) => /^@[A-Za-z0-9_]+$/.test(l));
  const platform: SocialMediaMeta['platform'] = hasAtHandle ? 'threads' : 'facebook';

  return { kolName: firstLine, postedAt, platform };
}

/**
 * Parse Chinese date formats into ISO 8601 string.
 * Handles: YYYY年M月D日, M月D日 (assumes current year)
 */
export function extractChineseDate(text: string): string | null {
  // YYYY年M月D日
  const fullDateMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (fullDateMatch) {
    const [, year, month, day] = fullDateMatch;
    const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const parsed = new Date(dateStr + 'T00:00:00');
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  // M月D日 (assume current year)
  const shortDateMatch = text.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (shortDateMatch) {
    const [, month, day] = shortDateMatch;
    const year = new Date().getFullYear();
    const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const parsed = new Date(dateStr + 'T00:00:00');
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

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
  const sentiment = Math.max(-3, Math.min(3, Math.round(result.sentiment))) as Sentiment;

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

  const genOptions = { temperature: 0.3, maxOutputTokens: 2048 };

  const validateAndClamp = (raw: ExtractedArgument[]): ExtractedArgument[] =>
    (raw || [])
      .filter((arg) => FRAMEWORK_CATEGORIES.some((cat) => cat.code === arg.categoryCode))
      .map((arg) => ({
        categoryCode: arg.categoryCode,
        originalText: (arg.originalText || '').slice(0, 500),
        summary: (arg.summary || '').slice(0, 200),
        sentiment: Math.max(-3, Math.min(3, Math.round(arg.sentiment))) as Sentiment,
        confidence: Math.max(0, Math.min(1, arg.confidence || 0.5)),
      }));

  // Round 1: initial extraction
  const result = await generateJson<ArgumentExtractionResult>(prompt, genOptions);
  let validated = validateAndClamp(result.arguments);

  // Round 2: if too many, send mediocre feedback and ask Gemini to revise
  if (validated.length > 5) {
    const revisionPrompt = buildRevisionPrompt(content, ticker, stockName, validated);
    const revised = await generateJson<ArgumentExtractionResult>(revisionPrompt, genOptions);
    validated = validateAndClamp(revised.arguments);
  }

  // Hard caps: max 3 per category, max 5 total
  return { arguments: applyHardCaps(validated) };
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
  const aiTickers = (result.tickers || [])
    .filter((t) => t.ticker && t.name && validMarkets.includes(t.market))
    .map((t) => ({
      ticker: t.ticker.trim().toUpperCase(),
      name: t.name.trim(),
      market: t.market as IdentifiedTicker['market'],
      confidence: Math.max(0, Math.min(1, t.confidence || 0.5)),
      mentionedAs: (t.mentionedAs || t.name).slice(0, 100),
    }));

  // Merge with regex-extracted cashtags to catch any the AI missed
  const tickers = mergeWithCashtags(aiTickers, content);

  return { tickers };
}

/**
 * 綜合分析草稿內容 — 一次提取 KOL、標的、情緒、發文時間
 */
export async function analyzeDraftContent(
  content: string,
  timezone: string = 'Asia/Taipei'
): Promise<DraftAnalysisResult> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: timezone }); // YYYY-MM-DD

  // Pre-extract social media metadata as hints for AI
  const socialMeta = extractSocialMediaMeta(content);

  // Inject pre-extracted hints into the content sent to AI
  let promptContent = content;
  if (socialMeta.kolName || socialMeta.postedAt) {
    const hints: string[] = [];
    if (socialMeta.kolName) {
      hints.push(`預提取 KOL 名稱: ${socialMeta.kolName}`);
    }
    if (socialMeta.postedAt) {
      hints.push(`預提取發文日期: ${socialMeta.postedAt}`);
    }
    promptContent = `[系統提示: ${hints.join('、')}]\n\n${content}`;
  }

  const prompt = buildDraftAnalysisPrompt(timezone)
    .replace('{content}', promptContent)
    .replace('{today}', today);

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
    stockSentiments?: Record<string, number>;
    confidence: number;
    reasoning: string;
    postedAt: string | null;
  }

  const result = await generateJson<RawDraftAnalysis>(prompt, {
    temperature: 0.3,
    maxOutputTokens: 1536,
  });

  // 驗證並清理 tickers
  const validMarkets = ['US', 'TW', 'HK', 'CRYPTO'];
  const aiStockTickers: IdentifiedTicker[] = (result.tickers || [])
    .filter((t) => t.ticker && t.name && validMarkets.includes(t.market))
    .map((t) => ({
      ticker: t.ticker.trim().toUpperCase(),
      name: t.name.trim(),
      market: t.market as IdentifiedTicker['market'],
      confidence: Math.max(0, Math.min(1, t.confidence || 0.5)),
      mentionedAs: (t.mentionedAs || t.name).slice(0, 100),
    }));

  // Merge with regex-extracted cashtags to catch any the AI missed
  const stockTickers = mergeWithCashtags(aiStockTickers, content);

  // 驗證 sentiment
  const sentiment = Math.max(-3, Math.min(3, Math.round(result.sentiment || 0))) as Sentiment;

  // 驗證 postedAt — with Chinese date fallback from pre-extraction
  let postedAt: string | null = null;
  if (result.postedAt) {
    const parsed = new Date(result.postedAt);
    if (!isNaN(parsed.getTime())) {
      postedAt = parsed.toISOString();
    }
  }
  if (!postedAt && socialMeta.postedAt) {
    postedAt = extractChineseDate(socialMeta.postedAt);
  }

  // Fall back: AI → social media pre-extract → @handle
  const aiKolName = result.kolName?.trim() || null;
  const kolName = aiKolName || socialMeta.kolName || extractAtHandles(content)[0] || null;

  // Parse and validate per-stock sentiments
  const stockSentiments: Record<string, Sentiment> = {};
  if (result.stockSentiments && typeof result.stockSentiments === 'object') {
    for (const [ticker, val] of Object.entries(result.stockSentiments)) {
      if (typeof val === 'number') {
        const normalizedTicker = ticker.trim().toUpperCase();
        stockSentiments[normalizedTicker] = Math.max(-3, Math.min(3, Math.round(val))) as Sentiment;
      }
    }
  }

  return {
    kolName,
    stockTickers,
    sentiment,
    stockSentiments,
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
