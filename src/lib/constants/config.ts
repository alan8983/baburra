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
} as const;

// 情緒值對應
export const SENTIMENT_CONFIG = {
  STRONG_BEARISH: -2,
  BEARISH: -1,
  NEUTRAL: 0,
  BULLISH: 1,
  STRONG_BULLISH: 2,
} as const;
