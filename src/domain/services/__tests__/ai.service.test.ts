import { vi, describe, it, expect, beforeEach } from 'vitest';

// Must use vi.hoisted so the variable is available when vi.mock factory runs (hoisted)
const { mockGenerateJson } = vi.hoisted(() => ({
  mockGenerateJson: vi.fn(),
}));

vi.mock('@/infrastructure/api/gemini.client', () => ({
  generateJson: mockGenerateJson,
}));

import {
  analyzeDraftContent,
  identifyTickers,
  analyzeSentiment,
  extractArguments,
  getFrameworkCategories,
  getCategoryByCode,
} from '../ai.service';

beforeEach(() => {
  mockGenerateJson.mockReset();
});

// =====================
// analyzeDraftContent
// =====================

describe('analyzeDraftContent', () => {
  it('有效的 AI 回應應完整通過', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: '老王',
      tickers: [
        {
          ticker: 'AAPL',
          name: 'Apple Inc.',
          market: 'US',
          confidence: 0.9,
          mentionedAs: 'AAPL 蘋果',
        },
      ],
      sentiment: 1,
      confidence: 0.85,
      reasoning: '作者看好蘋果',
      postedAt: '2025-01-15T10:00:00Z',
    });

    const result = await analyzeDraftContent('test content');

    expect(result.kolName).toBe('老王');
    expect(result.stockTickers).toHaveLength(1);
    expect(result.stockTickers[0].ticker).toBe('AAPL');
    expect(result.stockTickers[0].market).toBe('US');
    expect(result.sentiment).toBe(1);
    expect(result.confidence).toBe(0.85);
    expect(result.reasoning).toBe('作者看好蘋果');
    expect(result.postedAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('sentiment 超出範圍應被 clamp', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 5,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.sentiment).toBe(2);
  });

  it('sentiment 負向超出範圍應被 clamp 到 -2', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: -3,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.sentiment).toBe(-2);
  });

  it('sentiment 浮點數應被四捨五入', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 1.7,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.sentiment).toBe(2);
  });

  it('confidence 超出範圍應被 clamp', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 1.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.confidence).toBe(1);
  });

  it('confidence 為負數應被 clamp 到 0', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: -0.3,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.confidence).toBe(0);
  });

  it('無效的 market 應被過濾', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        { ticker: 'AAPL', name: 'Apple', market: 'US', confidence: 0.9, mentionedAs: 'AAPL' },
        { ticker: '7203', name: 'Toyota', market: 'JP', confidence: 0.8, mentionedAs: 'Toyota' },
      ],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.stockTickers).toHaveLength(1);
    expect(result.stockTickers[0].ticker).toBe('AAPL');
  });

  it('缺少必要欄位的 ticker 應被過濾', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        { ticker: '', name: 'Apple', market: 'US', confidence: 0.9, mentionedAs: 'AAPL' },
        { ticker: 'TSLA', name: '', market: 'US', confidence: 0.9, mentionedAs: 'TSLA' },
        { ticker: 'NVDA', name: 'NVIDIA', market: 'US', confidence: 0.9, mentionedAs: 'NVDA' },
      ],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.stockTickers).toHaveLength(1);
    expect(result.stockTickers[0].ticker).toBe('NVDA');
  });

  it('ticker 應被轉為大寫並去除空白', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        { ticker: ' aapl ', name: 'Apple', market: 'US', confidence: 0.9, mentionedAs: 'aapl' },
      ],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.stockTickers[0].ticker).toBe('AAPL');
  });

  it('mentionedAs 超過 100 字元應被截斷', async () => {
    const longText = 'A'.repeat(200);
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        { ticker: 'AAPL', name: 'Apple', market: 'US', confidence: 0.9, mentionedAs: longText },
      ],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.stockTickers[0].mentionedAs).toHaveLength(100);
  });

  it('無效的 postedAt 應回傳 null', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: 'not-a-date',
    });

    const result = await analyzeDraftContent('test');
    expect(result.postedAt).toBeNull();
  });

  it('有效的 postedAt 應轉為 ISO 字串', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: '2025-03-15',
    });

    const result = await analyzeDraftContent('test');
    expect(result.postedAt).toBe(new Date('2025-03-15').toISOString());
  });

  it('kolName 應去除空白，空字串轉為 null', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: '  ',
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.kolName).toBeNull();
  });

  it('kolName 前後空白應被去除', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: '  John  ',
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.kolName).toBe('John');
  });

  it('tickers 為 undefined 時應回傳空陣列', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: undefined,
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.stockTickers).toEqual([]);
  });

  it('confidence 未提供時應預設為 0.5', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [{ ticker: 'AAPL', name: 'Apple', market: 'US', mentionedAs: 'AAPL' }],
      sentiment: 0,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.confidence).toBe(0.5);
    expect(result.stockTickers[0].confidence).toBe(0.5);
  });

  it('支援所有有效市場: US, TW, HK, CRYPTO', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        { ticker: 'AAPL', name: 'Apple', market: 'US', confidence: 0.9, mentionedAs: 'AAPL' },
        { ticker: '2330.TW', name: '台積電', market: 'TW', confidence: 0.9, mentionedAs: '台積電' },
        { ticker: '0700.HK', name: '騰訊', market: 'HK', confidence: 0.9, mentionedAs: '騰訊' },
        { ticker: 'BTC', name: 'Bitcoin', market: 'CRYPTO', confidence: 0.9, mentionedAs: 'BTC' },
      ],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.stockTickers).toHaveLength(4);
    expect(result.stockTickers.map((t) => t.market)).toEqual(['US', 'TW', 'HK', 'CRYPTO']);
  });

  it('應將 timezone 傳入 prompt 中', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: '2025-01-15T10:00:00+08:00',
    });

    await analyzeDraftContent('test', 'America/New_York');

    const promptArg = mockGenerateJson.mock.calls[0][0] as string;
    expect(promptArg).toContain('America/New_York');
  });

  it('postedAt 帶時區偏移量應正確轉換為 UTC', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: '2025-01-15T22:59:00+08:00',
    });

    const result = await analyzeDraftContent('test', 'Asia/Taipei');
    expect(result.postedAt).toBe('2025-01-15T14:59:00.000Z');
  });
});

// =====================
// identifyTickers
// =====================

describe('identifyTickers', () => {
  it('有效的 tickers 應完整通過', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      tickers: [
        {
          ticker: 'AAPL',
          name: 'Apple Inc.',
          market: 'US',
          confidence: 0.95,
          mentionedAs: 'Apple',
        },
        { ticker: '2330.TW', name: '台積電', market: 'TW', confidence: 0.9, mentionedAs: '台積電' },
      ],
    });

    const result = await identifyTickers('test content');
    expect(result.tickers).toHaveLength(2);
    expect(result.tickers[0].ticker).toBe('AAPL');
    expect(result.tickers[1].ticker).toBe('2330.TW');
  });

  it('無效 market 應被過濾', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      tickers: [
        { ticker: 'AAPL', name: 'Apple', market: 'US', confidence: 0.9, mentionedAs: 'AAPL' },
        { ticker: '7203', name: 'Toyota', market: 'JP', confidence: 0.8, mentionedAs: 'Toyota' },
      ],
    });

    const result = await identifyTickers('test');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].ticker).toBe('AAPL');
  });

  it('ticker 應被轉為大寫並去除空白', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      tickers: [
        { ticker: ' tsla ', name: 'Tesla', market: 'US', confidence: 0.9, mentionedAs: 'tsla' },
      ],
    });

    const result = await identifyTickers('test');
    expect(result.tickers[0].ticker).toBe('TSLA');
  });

  it('缺少 ticker 或 name 應被過濾', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      tickers: [
        { ticker: '', name: 'Apple', market: 'US', confidence: 0.9, mentionedAs: 'AAPL' },
        { ticker: 'TSLA', name: '', market: 'US', confidence: 0.9, mentionedAs: 'TSLA' },
        { ticker: 'NVDA', name: 'NVIDIA', market: 'US', confidence: 0.9, mentionedAs: 'NVDA' },
      ],
    });

    const result = await identifyTickers('test');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].ticker).toBe('NVDA');
  });

  it('confidence 未提供時應預設為 0.5', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      tickers: [{ ticker: 'AAPL', name: 'Apple', market: 'US', mentionedAs: 'AAPL' }],
    });

    const result = await identifyTickers('test');
    expect(result.tickers[0].confidence).toBe(0.5);
  });

  it('tickers 為 undefined 時應回傳空陣列', async () => {
    mockGenerateJson.mockResolvedValueOnce({ tickers: undefined });

    const result = await identifyTickers('test');
    expect(result.tickers).toEqual([]);
  });

  it('mentionedAs 未提供時應 fallback 到 name', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      tickers: [{ ticker: 'AAPL', name: 'Apple Inc.', market: 'US', confidence: 0.9 }],
    });

    const result = await identifyTickers('test');
    expect(result.tickers[0].mentionedAs).toBe('Apple Inc.');
  });
});

// =====================
// analyzeSentiment
// =====================

describe('analyzeSentiment', () => {
  it('有效的回應應完整通過', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      sentiment: 1,
      confidence: 0.8,
      reasoning: '作者看好蘋果股價',
    });

    const result = await analyzeSentiment('test content');
    expect(result.sentiment).toBe(1);
    expect(result.confidence).toBe(0.8);
    expect(result.reasoning).toBe('作者看好蘋果股價');
  });

  it('sentiment 超出範圍應被 clamp', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      sentiment: 10,
      confidence: 0.5,
      reasoning: '',
    });

    const result = await analyzeSentiment('test');
    expect(result.sentiment).toBe(2);
  });

  it('sentiment 負向超出範圍應被 clamp 到 -2', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      sentiment: -5,
      confidence: 0.5,
      reasoning: '',
    });

    const result = await analyzeSentiment('test');
    expect(result.sentiment).toBe(-2);
  });

  it('confidence 超出範圍應被 clamp', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      sentiment: 0,
      confidence: 2.0,
      reasoning: '',
    });

    const result = await analyzeSentiment('test');
    expect(result.confidence).toBe(1);
  });

  it('reasoning 為 undefined 應回傳空字串', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      sentiment: 0,
      confidence: 0.5,
      reasoning: undefined,
    });

    const result = await analyzeSentiment('test');
    expect(result.reasoning).toBe('');
  });
});

// =====================
// extractArguments
// =====================

describe('extractArguments', () => {
  it('有效的論點應完整通過', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      arguments: [
        {
          categoryCode: 'FINANCIALS',
          originalText: '公司營收成長 30%',
          summary: '營收強勁成長',
          sentiment: 1,
          confidence: 0.8,
        },
        {
          categoryCode: 'CATALYST',
          originalText: '即將公布財報',
          summary: '財報催化劑',
          sentiment: 1,
          confidence: 0.7,
        },
      ],
    });

    const result = await extractArguments('test content', 'AAPL', 'Apple Inc.');
    expect(result.arguments).toHaveLength(2);
    expect(result.arguments[0].categoryCode).toBe('FINANCIALS');
    expect(result.arguments[1].categoryCode).toBe('CATALYST');
  });

  it('無效的 categoryCode 應被過濾', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      arguments: [
        {
          categoryCode: 'INVALID_CATEGORY',
          originalText: 'some text',
          summary: 'summary',
          sentiment: 1,
          confidence: 0.8,
        },
        {
          categoryCode: 'MOAT',
          originalText: '護城河很強',
          summary: '強大護城河',
          sentiment: 1,
          confidence: 0.9,
        },
      ],
    });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments).toHaveLength(1);
    expect(result.arguments[0].categoryCode).toBe('MOAT');
  });

  it('originalText 超過 500 字元應被截斷', async () => {
    const longText = 'A'.repeat(600);
    mockGenerateJson.mockResolvedValueOnce({
      arguments: [
        {
          categoryCode: 'FINANCIALS',
          originalText: longText,
          summary: 'summary',
          sentiment: 1,
          confidence: 0.8,
        },
      ],
    });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments[0].originalText).toHaveLength(500);
  });

  it('summary 超過 200 字元應被截斷', async () => {
    const longSummary = 'B'.repeat(300);
    mockGenerateJson.mockResolvedValueOnce({
      arguments: [
        {
          categoryCode: 'FINANCIALS',
          originalText: 'some text',
          summary: longSummary,
          sentiment: 1,
          confidence: 0.8,
        },
      ],
    });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments[0].summary).toHaveLength(200);
  });

  it('sentiment 和 confidence 應被 clamp', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      arguments: [
        {
          categoryCode: 'FINANCIALS',
          originalText: 'text',
          summary: 'summary',
          sentiment: 5,
          confidence: 1.5,
        },
      ],
    });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments[0].sentiment).toBe(2);
    expect(result.arguments[0].confidence).toBe(1);
  });

  it('arguments 為 undefined 時應回傳空陣列', async () => {
    mockGenerateJson.mockResolvedValueOnce({ arguments: undefined });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments).toEqual([]);
  });

  it('confidence 未提供時應預設為 0.5', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      arguments: [
        {
          categoryCode: 'FINANCIALS',
          originalText: 'text',
          summary: 'summary',
          sentiment: 1,
        },
      ],
    });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments[0].confidence).toBe(0.5);
  });
});

// =====================
// Pure functions
// =====================

describe('getFrameworkCategories', () => {
  it('應回傳 7 個分析框架類別', () => {
    const categories = getFrameworkCategories();
    expect(categories).toHaveLength(7);
  });

  it('應包含所有預期的類別代碼', () => {
    const categories = getFrameworkCategories();
    const codes = categories.map((c) => c.code);
    expect(codes).toEqual([
      'FINANCIALS',
      'MOMENTUM',
      'VALUATION',
      'MARKET_SIZE',
      'MOAT',
      'OPERATIONAL_QUALITY',
      'CATALYST',
    ]);
  });
});

describe('getCategoryByCode', () => {
  it('應回傳正確的類別', () => {
    const category = getCategoryByCode('FINANCIALS');
    expect(category).toBeDefined();
    expect(category!.code).toBe('FINANCIALS');
    expect(category!.name).toBe('財務體質');
  });

  it('無效代碼應回傳 undefined', () => {
    const category = getCategoryByCode('INVALID');
    expect(category).toBeUndefined();
  });
});

// =====================================================
// 資料驅動模板 — analyzeDraftContent 樣本案例
// =====================================================
// 使用方式：在 DRAFT_ANALYSIS_CASES 陣列中新增案例即可，
// 測試框架會自動為每個案例產生獨立的測試。
//
// mockResponse: 模擬 Gemini AI 回傳的原始 JSON（驗證前）
// expected: 經過 ai.service 驗證/清理後的預期結果

interface DraftAnalysisCaseInput {
  name: string;
  inputText: string;
  mockResponse: {
    kolName: string | null;
    tickers: Array<{
      ticker: string;
      name: string;
      market: string;
      confidence?: number;
      mentionedAs?: string;
    }>;
    sentiment: number;
    confidence?: number;
    reasoning: string;
    postedAt: string | null;
  };
  expected: {
    kolName: string | null;
    tickerCount: number;
    firstTicker?: string;
    sentiment: number;
  };
}

// ========================================
// SAMPLE CASES — 在這裡新增你的測試案例
// ========================================
const DRAFT_ANALYSIS_CASES: DraftAnalysisCaseInput[] = [
  {
    name: '美股看多文章',
    inputText: '老王表示 AAPL 蘋果今年很強，建議買入。',
    mockResponse: {
      kolName: '老王',
      tickers: [
        {
          ticker: 'AAPL',
          name: 'Apple Inc.',
          market: 'US',
          confidence: 0.9,
          mentionedAs: 'AAPL 蘋果',
        },
      ],
      sentiment: 1,
      confidence: 0.85,
      reasoning: '作者看好蘋果',
      postedAt: null,
    },
    expected: {
      kolName: '老王',
      tickerCount: 1,
      firstTicker: 'AAPL',
      sentiment: 1,
    },
  },
  {
    name: '台股看多文章',
    inputText: '台積電 2330 最近法說會表現不錯，看好下半年營收成長。',
    mockResponse: {
      kolName: null,
      tickers: [
        {
          ticker: '2330.TW',
          name: '台積電',
          market: 'TW',
          confidence: 0.95,
          mentionedAs: '台積電 2330',
        },
      ],
      sentiment: 1,
      confidence: 0.9,
      reasoning: '法說會正面，看好營收',
      postedAt: null,
    },
    expected: {
      kolName: null,
      tickerCount: 1,
      firstTicker: '2330.TW',
      sentiment: 1,
    },
  },
  {
    name: '多標的混合情緒',
    inputText: '小李認為 TSLA 短期有壓力，但 NVDA 受惠 AI 長期看好。',
    mockResponse: {
      kolName: '小李',
      tickers: [
        { ticker: 'TSLA', name: 'Tesla Inc.', market: 'US', confidence: 0.85, mentionedAs: 'TSLA' },
        {
          ticker: 'NVDA',
          name: 'NVIDIA Corp.',
          market: 'US',
          confidence: 0.9,
          mentionedAs: 'NVDA',
        },
      ],
      sentiment: 0,
      confidence: 0.7,
      reasoning: '對不同標的看法分歧',
      postedAt: null,
    },
    expected: {
      kolName: '小李',
      tickerCount: 2,
      firstTicker: 'TSLA',
      sentiment: 0,
    },
  },
  {
    name: '加密貨幣看空',
    inputText: '分析師 CryptoKing 表示 BTC 已經見頂，建議減持。',
    mockResponse: {
      kolName: 'CryptoKing',
      tickers: [
        { ticker: 'BTC', name: 'Bitcoin', market: 'CRYPTO', confidence: 0.8, mentionedAs: 'BTC' },
      ],
      sentiment: -2,
      confidence: 0.75,
      reasoning: '明確建議減持',
      postedAt: null,
    },
    expected: {
      kolName: 'CryptoKing',
      tickerCount: 1,
      firstTicker: 'BTC',
      sentiment: -2,
    },
  },
  {
    name: '無明確標的的中立文章',
    inputText: '今天市場波動加大，投資人應保持謹慎。',
    mockResponse: {
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.6,
      reasoning: '無特定標的，中立觀點',
      postedAt: null,
    },
    expected: {
      kolName: null,
      tickerCount: 0,
      sentiment: 0,
    },
  },
  // --- 在這裡新增更多案例 ---
  // {
  //   name: '港股看多',
  //   inputText: '騰訊 0700.HK 遊戲業務回暖，看好長期表現。',
  //   mockResponse: {
  //     kolName: null,
  //     tickers: [
  //       { ticker: '0700.HK', name: '騰訊', market: 'HK', confidence: 0.85, mentionedAs: '騰訊' },
  //     ],
  //     sentiment: 1,
  //     confidence: 0.8,
  //     reasoning: '遊戲業務回暖',
  //     postedAt: null,
  //   },
  //   expected: {
  //     kolName: null,
  //     tickerCount: 1,
  //     firstTicker: '0700.HK',
  //     sentiment: 1,
  //   },
  // },
];

// ========================================
// 測試邏輯 — 不需要修改以下內容
// ========================================

describe('analyzeDraftContent — 樣本案例', () => {
  for (const tc of DRAFT_ANALYSIS_CASES) {
    it(`${tc.name}`, async () => {
      mockGenerateJson.mockResolvedValueOnce(tc.mockResponse);

      const result = await analyzeDraftContent(tc.inputText);

      expect(result.kolName).toBe(tc.expected.kolName);
      expect(result.stockTickers).toHaveLength(tc.expected.tickerCount);
      if (tc.expected.firstTicker && result.stockTickers.length > 0) {
        expect(result.stockTickers[0].ticker).toBe(tc.expected.firstTicker);
      }
      expect(result.sentiment).toBe(tc.expected.sentiment);
    });
  }
});
