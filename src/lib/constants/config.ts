// 應用程式設定常數

export const APP_CONFIG = {
  // 應用程式名稱
  APP_NAME: 'Baburra',
  APP_DESCRIPTION: 'Track KOL investment opinions and measure accuracy over time',

  // 分頁設定
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  // 快取設定
  STOCK_PRICE_CACHE_DAYS: 1095,

  // AI 配額
  AI_FREE_WEEKLY_LIMIT: 15,
  AI_PREMIUM_WEEKLY_LIMIT: 100,

  // 報酬率計算週期 (天數)
  RETURN_RATE_PERIODS: [5, 30, 90, 365] as const,

  // 圖片上傳
  MAX_IMAGE_SIZE_MB: 5,
  MAX_IMAGES_PER_POST: 10,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  // Scrape rate limiting
  SCRAPE_DAILY_LIMIT: 3,
} as const;

// AI rate limiting for concurrent Gemini calls during scrape
export const AI_RATE_LIMIT = {
  maxConcurrentAnalysis: 10,
  cooldownMs: 1000,
} as const;

// Scrape caps per platform (max posts to store)
export const SCRAPE_CAPS: Record<string, number> = {
  youtube: 200,
  twitter: 500,
  instagram: 500,
  facebook: 300,
  tiktok: 200,
};

// 情緒值對應 (-3 ~ +3, 7-point scale)
export const SENTIMENT_CONFIG = {
  EXTREME_BEARISH: -3,
  BEARISH: -2,
  SLIGHTLY_BEARISH: -1,
  NEUTRAL: 0,
  SLIGHTLY_BULLISH: 1,
  BULLISH: 2,
  EXTREME_BULLISH: 3,
} as const;
