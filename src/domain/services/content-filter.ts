/**
 * Content pre-filter for Shorts
 *
 * Lightweight keyword-based check that determines whether a video title/description
 * is likely about investments. Runs BEFORE transcription to save credits on
 * non-investment Shorts from channels that mix content types.
 */

const POSITIVE_KEYWORDS_ZH = [
  '股票',
  '投資',
  '台積電',
  '多頭',
  '空頭',
  'ETF',
  '財報',
  '殖利率',
  '股市',
  '台股',
  '美股',
  '加密',
  '比特幣',
  '以太坊',
  '漲',
  '跌',
  '買進',
  '賣出',
  '目標價',
  '本益比',
];

const POSITIVE_KEYWORDS_EN = [
  'stock',
  'invest',
  'bullish',
  'bearish',
  'earnings',
  'dividend',
  'etf',
  'crypto',
  'bitcoin',
  'portfolio',
  'market',
  'trading',
  'buy',
  'sell',
  'ticker',
  'pe ratio',
  'target price',
];

const NEGATIVE_KEYWORDS_ZH = ['開箱', '日常', '旅遊', '料理', '美食', '穿搭', '化妝'];

const NEGATIVE_KEYWORDS_EN = [
  'unboxing',
  'vlog',
  'cooking',
  'travel',
  'recipe',
  'makeup',
  'haul',
  'grwm',
];

const POSITIVE_KEYWORDS = [...POSITIVE_KEYWORDS_ZH, ...POSITIVE_KEYWORDS_EN];
const NEGATIVE_KEYWORDS = [...NEGATIVE_KEYWORDS_ZH, ...NEGATIVE_KEYWORDS_EN];

/**
 * Check if a video's title + description suggest investment-related content.
 *
 * Rules:
 * - Pass if both title and description are empty (cannot filter without metadata).
 * - Pass if >= 1 positive keyword AND 0 negative keywords are found.
 * - Fail otherwise.
 */
export function isLikelyInvestmentContent(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();

  // Cannot filter without metadata — allow through
  if (title.trim() === '' && description.trim() === '') {
    return true;
  }

  const hasPositive = POSITIVE_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
  const hasNegative = NEGATIVE_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));

  return hasPositive && !hasNegative;
}
