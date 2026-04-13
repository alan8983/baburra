import { vi, describe, it, expect, beforeEach } from 'vitest';

// Must use vi.hoisted so the variable is available when vi.mock factory runs (hoisted)
const { mockGenerateJson, mockGenerateStructuredJson } = vi.hoisted(() => ({
  mockGenerateJson: vi.fn(),
  mockGenerateStructuredJson: vi.fn(),
}));

vi.mock('@/infrastructure/api/gemini.client', () => ({
  generateJson: mockGenerateJson,
  generateStructuredJson: mockGenerateStructuredJson,
}));

import {
  analyzeDraftContent,
  identifyTickers,
  analyzeSentiment,
  extractArguments,
  applyHardCaps,
  extractCashtags,
  extractAtHandles,
  isBenchmarkTicker,
  getFrameworkCategories,
  getCategoryByCode,
  extractSocialMediaMeta,
  extractChineseDate,
} from '../ai.service';

beforeEach(() => {
  mockGenerateJson.mockReset();
  mockGenerateStructuredJson.mockReset();
});

// =====================
// analyzeDraftContent
// =====================

describe('analyzeDraftContent', () => {
  it('有效的 AI 回應應完整通過', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 5,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.sentiment).toBe(3);
  });

  it('sentiment 負向超出範圍應被 clamp 到 -3', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: -5,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.sentiment).toBe(-3);
  });

  it('sentiment 浮點數應被四捨五入', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
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
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: '2025-01-15T10:00:00+08:00',
    });

    await analyzeDraftContent('test', 'America/New_York');

    const promptArg = mockGenerateStructuredJson.mock.calls[0][0] as string;
    expect(promptArg).toContain('America/New_York');
  });

  it('postedAt 帶時區偏移量應正確轉換為 UTC', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
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

  // Per-stock sentiment tests
  it('returns per-stock sentiments when AI provides them', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: '小李',
      tickers: [
        { ticker: 'NVDA', name: 'NVIDIA', market: 'US', confidence: 0.9, mentionedAs: 'NVDA' },
        { ticker: 'AMD', name: 'AMD', market: 'US', confidence: 0.9, mentionedAs: 'AMD' },
      ],
      sentiment: 0,
      stockSentiments: { NVDA: 2, AMD: -1 },
      confidence: 0.8,
      reasoning: 'NVDA bullish, AMD bearish',
      postedAt: null,
    });

    const result = await analyzeDraftContent('NVDA will crush it, AMD is in trouble');
    expect(result.stockSentiments).toEqual({ NVDA: 2, AMD: -1 });
    expect(result.sentiment).toBe(0);
  });

  it('returns empty stockSentiments when AI omits them', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        { ticker: 'AAPL', name: 'Apple', market: 'US', confidence: 0.9, mentionedAs: 'AAPL' },
      ],
      sentiment: 1,
      confidence: 0.8,
      reasoning: 'bullish',
      postedAt: null,
    });

    const result = await analyzeDraftContent('AAPL is great');
    expect(result.stockSentiments).toEqual({});
  });

  it('clamps per-stock sentiment values to valid range', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        { ticker: 'AAPL', name: 'Apple', market: 'US', confidence: 0.9, mentionedAs: 'AAPL' },
      ],
      sentiment: 1,
      stockSentiments: { AAPL: 5 },
      confidence: 0.8,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.stockSentiments.AAPL).toBe(3);
  });

  it('normalizes stockSentiments ticker keys to uppercase', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        { ticker: 'AAPL', name: 'Apple', market: 'US', confidence: 0.9, mentionedAs: 'aapl' },
      ],
      sentiment: 1,
      stockSentiments: { aapl: 1 },
      confidence: 0.8,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('test');
    expect(result.stockSentiments).toEqual({ AAPL: 1 });
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
// extractCashtags (pure function)
// =====================

describe('extractCashtags', () => {
  it('should extract single cashtag', () => {
    expect(extractCashtags('Bullish $ONDS today')).toEqual(['ONDS']);
  });

  it('should extract multiple cashtags', () => {
    expect(extractCashtags('$AAPL and $TSLA are both strong')).toEqual(['AAPL', 'TSLA']);
  });

  it('should deduplicate repeated cashtags', () => {
    expect(extractCashtags('$ONDS is great, $ONDS is amazing')).toEqual(['ONDS']);
  });

  it('should not match dollar amounts like $10,000', () => {
    expect(extractCashtags('You borrow $40,000 and buy $50,000 worth')).toEqual([]);
  });

  it('should not match lowercase cashtags', () => {
    expect(extractCashtags('$onds and $aapl')).toEqual([]);
  });

  it('should not match tickers longer than 6 characters', () => {
    expect(extractCashtags('$TOOLONG is not a ticker')).toEqual([]);
  });

  it('should match tickers with 1-6 uppercase letters', () => {
    expect(extractCashtags('$A $AB $ABC $ABCD $ABCDE $ABCDEF')).toEqual([
      'A',
      'AB',
      'ABC',
      'ABCD',
      'ABCDE',
      'ABCDEF',
    ]);
  });

  it('should return empty array when no cashtags found', () => {
    expect(extractCashtags('No tickers mentioned here')).toEqual([]);
  });

  it('should handle cashtag at start and end of text', () => {
    expect(extractCashtags('$AAPL is great and so is $NVDA')).toEqual(['AAPL', 'NVDA']);
  });

  it('should handle the SharkChart ONDS case — ticker buried in educational content', () => {
    const content = `$ONDS investors (and all investors) should understand deleveraging
Most people see a red day and panic. They see their position down 10, 15, 20% and assume the thesis is broken.
Say you have $10,000. Instead of just buying $10,000 worth of stock, you borrow $40,000 and buy $50,000 worth.`;
    expect(extractCashtags(content)).toEqual(['ONDS']);
  });
});

// =====================
// identifyTickers — cashtag merge behavior
// =====================

describe('identifyTickers — cashtag merge', () => {
  it('should add cashtag tickers when AI returns empty', async () => {
    mockGenerateJson.mockResolvedValueOnce({ tickers: [] });

    const result = await identifyTickers('Bullish $ONDS and counter-drone defense');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].ticker).toBe('ONDS');
    expect(result.tickers[0].market).toBe('US');
    expect(result.tickers[0].confidence).toBe(0.7);
    expect(result.tickers[0].mentionedAs).toBe('$ONDS');
  });

  it('should not duplicate when AI already identified the cashtag', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      tickers: [
        {
          ticker: 'ONDS',
          name: 'Ondas Holdings',
          market: 'US',
          confidence: 0.9,
          mentionedAs: '$ONDS',
        },
      ],
    });

    const result = await identifyTickers('Bullish $ONDS');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].name).toBe('Ondas Holdings');
    expect(result.tickers[0].confidence).toBe(0.9);
  });

  it('should merge AI tickers with missing cashtag tickers', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      tickers: [
        {
          ticker: 'AAPL',
          name: 'Apple Inc.',
          market: 'US',
          confidence: 0.9,
          mentionedAs: 'Apple',
        },
      ],
    });

    const result = await identifyTickers('$AAPL is great but also check $ONDS');
    expect(result.tickers).toHaveLength(2);
    expect(result.tickers[0].ticker).toBe('AAPL');
    expect(result.tickers[0].name).toBe('Apple Inc.');
    expect(result.tickers[1].ticker).toBe('ONDS');
    expect(result.tickers[1].name).toBe('ONDS');
  });
});

// =====================
// analyzeDraftContent — cashtag merge behavior
// =====================

describe('analyzeDraftContent — cashtag merge', () => {
  it('should add cashtag tickers when AI misses them', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: 'SharkChart',
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: 'Educational content about deleveraging',
      postedAt: null,
    });

    const content = '$ONDS investors should understand deleveraging. Say you have $10,000...';
    const result = await analyzeDraftContent(content);
    expect(result.stockTickers).toHaveLength(1);
    expect(result.stockTickers[0].ticker).toBe('ONDS');
    expect(result.stockTickers[0].market).toBe('US');
  });

  it('should not duplicate when AI already identified cashtag', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: 'Bodoxstocks',
      tickers: [
        {
          ticker: 'ONDS',
          name: 'Ondas Holdings',
          market: 'US',
          confidence: 0.95,
          mentionedAs: '$ONDS',
        },
      ],
      sentiment: 2,
      confidence: 0.9,
      reasoning: 'Explicitly bullish',
      postedAt: null,
    });

    const result = await analyzeDraftContent('Bullish $ONDS — EU drone defense');
    expect(result.stockTickers).toHaveLength(1);
    expect(result.stockTickers[0].name).toBe('Ondas Holdings');
  });
});

// =====================
// isBenchmarkTicker (pure function)
// =====================

describe('isBenchmarkTicker', () => {
  it('should identify common US index ETFs', () => {
    expect(isBenchmarkTicker('SPY')).toBe(true);
    expect(isBenchmarkTicker('QQQ')).toBe(true);
    expect(isBenchmarkTicker('DIA')).toBe(true);
    expect(isBenchmarkTicker('IWM')).toBe(true);
    expect(isBenchmarkTicker('VOO')).toBe(true);
    expect(isBenchmarkTicker('VTI')).toBe(true);
  });

  it('should identify volatility and bond benchmarks', () => {
    expect(isBenchmarkTicker('VIX')).toBe(true);
    expect(isBenchmarkTicker('TLT')).toBe(true);
  });

  it('should identify sector ETFs', () => {
    expect(isBenchmarkTicker('XLK')).toBe(true);
    expect(isBenchmarkTicker('XLF')).toBe(true);
  });

  it('should not flag individual stocks', () => {
    expect(isBenchmarkTicker('AAPL')).toBe(false);
    expect(isBenchmarkTicker('NVDA')).toBe(false);
    expect(isBenchmarkTicker('ONDS')).toBe(false);
    expect(isBenchmarkTicker('TSLA')).toBe(false);
  });
});

// =====================
// benchmark filtering in cashtag merge
// =====================

describe('identifyTickers — benchmark filtering', () => {
  it('should exclude benchmark cashtags when specific tickers exist', async () => {
    mockGenerateJson.mockResolvedValueOnce({ tickers: [] });

    const result = await identifyTickers('$NVDA is outperforming $SPY this quarter');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].ticker).toBe('NVDA');
  });

  it('should exclude multiple benchmarks alongside a specific ticker', async () => {
    mockGenerateJson.mockResolvedValueOnce({ tickers: [] });

    const result = await identifyTickers('$AAPL beat both $SPY and $QQQ this year');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].ticker).toBe('AAPL');
  });

  it('should keep benchmark if AI explicitly identified it as primary', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      tickers: [
        {
          ticker: 'SPY',
          name: 'SPDR S&P 500 ETF',
          market: 'US',
          confidence: 0.9,
          mentionedAs: '$SPY',
        },
      ],
    });

    const result = await identifyTickers('I am buying $SPY calls for next week');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].ticker).toBe('SPY');
    expect(result.tickers[0].name).toBe('SPDR S&P 500 ETF');
  });

  it('should allow benchmark through when it is the only cashtag', async () => {
    mockGenerateJson.mockResolvedValueOnce({ tickers: [] });

    const result = await identifyTickers('Going long $SPY into earnings season');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].ticker).toBe('SPY');
  });
});

describe('analyzeDraftContent — benchmark filtering', () => {
  it('should exclude comparison benchmarks from stock tickers', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: 'TraderJoe',
      tickers: [],
      sentiment: 1,
      confidence: 0.8,
      reasoning: 'Bullish on NVDA',
      postedAt: null,
    });

    const content = '$NVDA has been crushing $SPY and $QQQ all year. Time to load up.';
    const result = await analyzeDraftContent(content);
    expect(result.stockTickers).toHaveLength(1);
    expect(result.stockTickers[0].ticker).toBe('NVDA');
  });
});

// =====================
// extractAtHandles (pure function)
// =====================

describe('extractAtHandles', () => {
  it('should extract single @handle', () => {
    expect(extractAtHandles('Post by @bodoxstocks about drones')).toEqual(['bodoxstocks']);
  });

  it('should extract multiple @handles', () => {
    expect(extractAtHandles('@SharkChart reposted @bodoxstocks')).toEqual([
      'SharkChart',
      'bodoxstocks',
    ]);
  });

  it('should deduplicate repeated handles', () => {
    expect(extractAtHandles('@SharkChart said... @SharkChart also said')).toEqual(['SharkChart']);
  });

  it('should preserve original casing', () => {
    expect(extractAtHandles('@SharkChart')).toEqual(['SharkChart']);
    expect(extractAtHandles('@bodoxstocks')).toEqual(['bodoxstocks']);
  });

  it('should handle handles with underscores and numbers', () => {
    expect(extractAtHandles('@trader_42 is active')).toEqual(['trader_42']);
  });

  it('should not match single-character handles', () => {
    expect(extractAtHandles('@a is too short')).toEqual([]);
  });

  it('should not match email-like patterns as standalone handles', () => {
    // The regex matches @handle at word boundary — in email "user@domain" the @domain part
    // still matches. This is acceptable; the AI prompt already handles these edge cases.
    const handles = extractAtHandles('Post by @SharkChart');
    expect(handles).toEqual(['SharkChart']);
  });

  it('should return empty array when no handles found', () => {
    expect(extractAtHandles('No handles mentioned here')).toEqual([]);
  });

  it('should handle the Bodoxstocks fixture pattern', () => {
    const content = `Bodoxstocks\n@bodoxstocks\nBullish $ONDS`;
    expect(extractAtHandles(content)).toEqual(['bodoxstocks']);
  });

  it('should handle the SharkChart fixture pattern', () => {
    const content = `Shark Chart\n@SharkChart\n$ONDS investors should understand deleveraging`;
    expect(extractAtHandles(content)).toEqual(['SharkChart']);
  });
});

// =====================
// analyzeDraftContent — @handle KOL fallback
// =====================

describe('analyzeDraftContent — @handle KOL fallback', () => {
  it('should use @handle when AI returns null kolName', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: 'Educational content',
      postedAt: null,
    });

    const content = 'Shark Chart\n@SharkChart\n$ONDS investors should understand deleveraging';
    const result = await analyzeDraftContent(content);
    expect(result.kolName).toBe('SharkChart');
  });

  it('should prefer AI kolName over @handle', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: 'Shark Chart',
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const content = '@SharkChart posted something';
    const result = await analyzeDraftContent(content);
    expect(result.kolName).toBe('Shark Chart');
  });

  it('should use first @handle when multiple exist and AI returns null', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const content = '@SharkChart reposted @bodoxstocks about $ONDS';
    const result = await analyzeDraftContent(content);
    expect(result.kolName).toBe('SharkChart');
  });

  it('should return null when no AI kolName and no @handles', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('Some article without handles');
    expect(result.kolName).toBeNull();
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
    expect(result.sentiment).toBe(3);
  });

  it('sentiment 負向超出範圍應被 clamp 到 -3', async () => {
    mockGenerateJson.mockResolvedValueOnce({
      sentiment: -5,
      confidence: 0.5,
      reasoning: '',
    });

    const result = await analyzeSentiment('test');
    expect(result.sentiment).toBe(-3);
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
    const args = [
      {
        categoryCode: 'FINANCIALS',
        originalText: '公司營收成長 30%',
        summary: '營收強勁成長',
        sentiment: 1,
        confidence: 0.8,
        statementType: 'fact',
      },
      {
        categoryCode: 'CATALYST',
        originalText: '即將公布財報',
        summary: '財報催化劑',
        sentiment: 1,
        confidence: 0.7,
        statementType: 'opinion',
      },
    ];
    // Round 1: extraction, Round 3: verification (2+ args)
    mockGenerateStructuredJson.mockResolvedValueOnce({ arguments: args });
    mockGenerateStructuredJson.mockResolvedValueOnce({ arguments: args });

    const result = await extractArguments('test content', 'AAPL', 'Apple Inc.');
    expect(result.arguments).toHaveLength(2);
    expect(result.arguments[0].categoryCode).toBe('FINANCIALS');
    expect(result.arguments[0].statementType).toBe('fact');
    expect(result.arguments[1].categoryCode).toBe('CATALYST');
    expect(result.arguments[1].statementType).toBe('opinion');
  });

  it('無效的 categoryCode 應被過濾', async () => {
    const args = [
      {
        categoryCode: 'INVALID_CATEGORY',
        originalText: 'some text',
        summary: 'summary',
        sentiment: 1,
        confidence: 0.8,
        statementType: 'fact',
      },
      {
        categoryCode: 'MOAT',
        originalText: '護城河很強',
        summary: '強大護城河',
        sentiment: 1,
        confidence: 0.9,
        statementType: 'opinion',
      },
    ];
    // Only 1 valid arg after filtering → no verification pass
    mockGenerateStructuredJson.mockResolvedValueOnce({ arguments: args });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments).toHaveLength(1);
    expect(result.arguments[0].categoryCode).toBe('MOAT');
  });

  it('originalText 超過 500 字元應被截斷', async () => {
    const longText = 'A'.repeat(600);
    mockGenerateStructuredJson.mockResolvedValueOnce({
      arguments: [
        {
          categoryCode: 'FINANCIALS',
          originalText: longText,
          summary: 'summary',
          sentiment: 1,
          confidence: 0.8,
          statementType: 'mixed',
        },
      ],
    });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments[0].originalText).toHaveLength(500);
  });

  it('summary 超過 200 字元應被截斷', async () => {
    const longSummary = 'B'.repeat(300);
    mockGenerateStructuredJson.mockResolvedValueOnce({
      arguments: [
        {
          categoryCode: 'FINANCIALS',
          originalText: 'some text',
          summary: longSummary,
          sentiment: 1,
          confidence: 0.8,
          statementType: 'mixed',
        },
      ],
    });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments[0].summary).toHaveLength(200);
  });

  it('sentiment 和 confidence 應被 clamp', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      arguments: [
        {
          categoryCode: 'FINANCIALS',
          originalText: 'text',
          summary: 'summary',
          sentiment: 5,
          confidence: 1.5,
          statementType: 'fact',
        },
      ],
    });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments[0].sentiment).toBe(3);
    expect(result.arguments[0].confidence).toBe(1);
  });

  it('arguments 為 undefined 時應回傳空陣列', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({ arguments: undefined });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments).toEqual([]);
  });

  it('confidence 未提供時應預設為 0.5', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      arguments: [
        {
          categoryCode: 'FINANCIALS',
          originalText: 'text',
          summary: 'summary',
          sentiment: 1,
          statementType: 'mixed',
        },
      ],
    });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments[0].confidence).toBe(0.5);
  });

  it('invalid statementType should default to mixed', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      arguments: [
        {
          categoryCode: 'FINANCIALS',
          originalText: 'text',
          summary: 'summary',
          sentiment: 1,
          confidence: 0.8,
          statementType: 'invalid_type',
        },
      ],
    });

    const result = await extractArguments('test', 'AAPL', 'Apple');
    expect(result.arguments[0].statementType).toBe('mixed');
  });

  it('5 arguments or fewer — does NOT trigger revision, but triggers verification for 2+', async () => {
    const fiveArgs = Array.from({ length: 5 }, (_, i) => ({
      categoryCode: 'FINANCIALS',
      originalText: `text ${i}`,
      summary: `summary ${i}`,
      sentiment: 1,
      confidence: 0.8,
      statementType: 'mixed' as const,
    }));
    // Round 1: extraction, Round 3: verification (5 >= 2)
    mockGenerateStructuredJson.mockResolvedValueOnce({ arguments: fiveArgs });
    mockGenerateStructuredJson.mockResolvedValueOnce({ arguments: fiveArgs });

    await extractArguments('article', 'AAPL', 'Apple');
    // 2 calls: extraction + verification (no revision since <= 5)
    expect(mockGenerateStructuredJson).toHaveBeenCalledTimes(2);
  });

  it('more than 5 arguments — triggers revision then verification', async () => {
    const eightArgs = Array.from({ length: 8 }, (_, i) => ({
      categoryCode: i < 4 ? 'FINANCIALS' : 'MOMENTUM',
      originalText: `text ${i}`,
      summary: `summary ${i}`,
      sentiment: 1,
      confidence: 0.8,
      statementType: 'mixed' as const,
    }));
    const revisedArgs = [
      {
        categoryCode: 'FINANCIALS',
        originalText: 'revised',
        summary: 'rev sum',
        sentiment: 1,
        confidence: 0.9,
        statementType: 'fact' as const,
      },
    ];
    // Round 1: extraction (8 args), Round 2: revision (1 arg), no verification (< 2)
    mockGenerateStructuredJson.mockResolvedValueOnce({ arguments: eightArgs });
    mockGenerateStructuredJson.mockResolvedValueOnce({ arguments: revisedArgs });

    const result = await extractArguments('article', 'AAPL', 'Apple');
    expect(mockGenerateStructuredJson).toHaveBeenCalledTimes(2);
    expect(result.arguments).toHaveLength(1);
    expect(result.arguments[0].summary).toBe('rev sum');
  });

  it('applies hard caps: result never exceeds 5 total even if revision returns more', async () => {
    const eightArgs = Array.from({ length: 8 }, (_, i) => ({
      categoryCode: 'FINANCIALS',
      originalText: `t${i}`,
      summary: `s${i}`,
      sentiment: 0,
      confidence: 0.8,
      statementType: 'mixed' as const,
    }));
    // revision returns 11 — still capped at 5
    const elevenArgs = Array.from({ length: 11 }, (_, i) => ({
      categoryCode: 'CATALYST',
      originalText: `t${i}`,
      summary: `s${i}`,
      sentiment: 0,
      confidence: 0.5 + i * 0.04,
      statementType: 'mixed' as const,
    }));
    // Round 1: extraction (8), Round 2: revision (11→capped to 5), Round 3: verification (5 >= 2)
    mockGenerateStructuredJson.mockResolvedValueOnce({ arguments: eightArgs });
    mockGenerateStructuredJson.mockResolvedValueOnce({ arguments: elevenArgs });
    mockGenerateStructuredJson.mockResolvedValueOnce({
      arguments: elevenArgs.slice(0, 5),
    });

    const result = await extractArguments('article', 'AAPL', 'Apple');
    expect(result.arguments.length).toBeLessThanOrEqual(5);
  });
});

// =====================
// applyHardCaps (pure function)
// =====================

describe('applyHardCaps', () => {
  const makeArg = (categoryCode: string, confidence: number) => ({
    categoryCode,
    originalText: 'text',
    summary: 'sum',
    sentiment: 1 as const,
    confidence,
    statementType: 'mixed' as const,
  });

  it('caps each category at 3, keeping highest confidence', () => {
    const args = [
      makeArg('FINANCIALS', 0.9),
      makeArg('FINANCIALS', 0.8),
      makeArg('FINANCIALS', 0.7),
      makeArg('FINANCIALS', 0.6), // should be dropped
      makeArg('FINANCIALS', 0.5), // should be dropped
      makeArg('CATALYST', 0.9),
      makeArg('CATALYST', 0.8),
    ];
    const result = applyHardCaps(args);
    const financials = result.filter((a) => a.categoryCode === 'FINANCIALS');
    const catalyst = result.filter((a) => a.categoryCode === 'CATALYST');
    expect(financials).toHaveLength(3);
    expect(catalyst).toHaveLength(2);
    expect(financials[0].confidence).toBe(0.9);
    expect(financials[2].confidence).toBe(0.7);
  });

  it('caps total at 5, keeping highest confidence across categories', () => {
    // 4 categories × 3 each = 12 potential, capped per-category to 12, then total capped to 5
    const args = [
      ...Array.from({ length: 3 }, (_, i) => makeArg('FINANCIALS', 0.95 - i * 0.01)),
      ...Array.from({ length: 3 }, (_, i) => makeArg('MOMENTUM', 0.9 - i * 0.01)),
      ...Array.from({ length: 3 }, (_, i) => makeArg('VALUATION', 0.85 - i * 0.01)),
      ...Array.from({ length: 3 }, (_, i) => makeArg('CATALYST', 0.5 - i * 0.01)), // lowest
    ];
    const result = applyHardCaps(args);
    expect(result).toHaveLength(5);
    // Should keep the 5 highest-confidence args overall
    expect(result[0].confidence).toBe(0.95);
    expect(result[result.length - 1].confidence).toBe(0.89);
  });

  it('returns all args unchanged when within limits', () => {
    const args = [makeArg('FINANCIALS', 0.9), makeArg('CATALYST', 0.8)];
    expect(applyHardCaps(args)).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(applyHardCaps([])).toEqual([]);
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
  {
    name: 'Facebook 貼文 — 中文公司名稱（特斯拉→TSLA）',
    inputText:
      '謝金河\n\n ·\n追蹤\n2025年3月21日\n ·\n馬斯克的仇恨值\n面對特斯拉股價的跌跌不休，馬斯克最近接受FOX電視台訪問時表示，即使股價腰斬也在所不惜！',
    mockResponse: {
      kolName: '謝金河',
      tickers: [
        {
          ticker: 'TSLA',
          name: 'Tesla, Inc.',
          market: 'US',
          confidence: 0.9,
          mentionedAs: '特斯拉',
        },
      ],
      sentiment: -1,
      confidence: 0.8,
      reasoning: '文章描述特斯拉股價下跌，整體偏空',
      postedAt: '2025-03-21T00:00:00+08:00',
    },
    expected: {
      kolName: '謝金河',
      tickerCount: 1,
      firstTicker: 'TSLA',
      sentiment: -1,
    },
  },
];

// ========================================
// 測試邏輯 — 不需要修改以下內容
// ========================================

describe('analyzeDraftContent — 樣本案例', () => {
  for (const tc of DRAFT_ANALYSIS_CASES) {
    it(`${tc.name}`, async () => {
      mockGenerateStructuredJson.mockResolvedValueOnce(tc.mockResponse);

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

// =====================
// extractSocialMediaMeta
// =====================

describe('extractSocialMediaMeta', () => {
  it('should extract KOL name and date from Facebook paste pattern', () => {
    const content =
      '謝金河\n\n ·\n追蹤\n2025年3月21日\n ·\n馬斯克的仇恨值\n面對特斯拉股價的跌跌不休...';
    const meta = extractSocialMediaMeta(content);
    expect(meta.kolName).toBe('謝金河');
    expect(meta.postedAt).toBe('2025年3月21日');
    expect(meta.platform).toBe('facebook');
  });

  it('should extract KOL name from Threads paste pattern', () => {
    const content = '投資達人\n@investor_tw\n追蹤\n台積電今天表現亮眼';
    const meta = extractSocialMediaMeta(content);
    expect(meta.kolName).toBe('投資達人');
    expect(meta.platform).toBe('threads');
  });

  it('should return nulls for regular article text', () => {
    const content = '台積電今天股價大漲，法人看好後市表現。根據最新財報...';
    const meta = extractSocialMediaMeta(content);
    expect(meta.kolName).toBeNull();
    expect(meta.postedAt).toBeNull();
    expect(meta.platform).toBeNull();
  });

  it('should not match if first line is too long (sentence)', () => {
    const content = '這是一篇關於投資的很長的文章標題，不應該被當作名稱\n追蹤\n2025年3月21日';
    const meta = extractSocialMediaMeta(content);
    expect(meta.kolName).toBeNull();
  });

  it('should not match if no follow indicator present', () => {
    const content = '謝金河\n2025年3月21日\n馬斯克的仇恨值';
    const meta = extractSocialMediaMeta(content);
    expect(meta.kolName).toBeNull();
  });

  it('should handle English KOL names', () => {
    const content = 'Warren Buffett\n ·\n追蹤\n2025年1月15日\nBerkshire earnings were strong...';
    const meta = extractSocialMediaMeta(content);
    expect(meta.kolName).toBe('Warren Buffett');
    expect(meta.platform).toBe('facebook');
  });
});

// =====================
// extractChineseDate
// =====================

describe('extractChineseDate', () => {
  it('should parse YYYY年M月D日 format', () => {
    const result = extractChineseDate('2025年3月21日');
    expect(result).toBe(new Date('2025-03-21T00:00:00').toISOString());
  });

  it('should parse single-digit month and day', () => {
    const result = extractChineseDate('2025年1月5日');
    expect(result).toBe(new Date('2025-01-05T00:00:00').toISOString());
  });

  it('should return null for unrecognized format', () => {
    expect(extractChineseDate('some random text')).toBeNull();
    expect(extractChineseDate('')).toBeNull();
  });

  it('should handle text with surrounding content', () => {
    const result = extractChineseDate('發文於 2024年12月25日 下午');
    expect(result).toBe(new Date('2024-12-25T00:00:00').toISOString());
  });

  it('should parse M月D日 with current year', () => {
    const result = extractChineseDate('3月21日');
    const currentYear = new Date().getFullYear();
    expect(result).toBe(new Date(`${currentYear}-03-21T00:00:00`).toISOString());
  });
});

// =====================
// analyzeDraftContent — social media pre-processing
// =====================

describe('analyzeDraftContent — social media pre-processing', () => {
  it('should use pre-extracted KOL name when AI returns null', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        {
          ticker: 'TSLA',
          name: 'Tesla',
          market: 'US',
          confidence: 0.9,
          mentionedAs: '特斯拉',
        },
      ],
      sentiment: -1,
      confidence: 0.8,
      reasoning: '看空特斯拉',
      postedAt: null,
    });

    const content =
      '謝金河\n\n ·\n追蹤\n2025年3月21日\n ·\n馬斯克的仇恨值\n面對特斯拉股價的跌跌不休...';
    const result = await analyzeDraftContent(content);
    expect(result.kolName).toBe('謝金河');
  });

  it('should use pre-extracted date when AI returns null postedAt', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: '謝金河',
      tickers: [
        {
          ticker: 'TSLA',
          name: 'Tesla',
          market: 'US',
          confidence: 0.9,
          mentionedAs: '特斯拉',
        },
      ],
      sentiment: -1,
      confidence: 0.8,
      reasoning: '看空',
      postedAt: null,
    });

    const content = '謝金河\n\n ·\n追蹤\n2025年3月21日\n ·\n馬斯克的仇恨值...';
    const result = await analyzeDraftContent(content);
    expect(result.postedAt).toBe(new Date('2025-03-21T00:00:00').toISOString());
  });

  it('should inject pre-extracted hints into AI prompt', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: '謝金河',
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: '2025-03-21T00:00:00+08:00',
    });

    const content = '謝金河\n\n ·\n追蹤\n2025年3月21日\n ·\n文章內容...';
    await analyzeDraftContent(content);

    const promptArg = mockGenerateStructuredJson.mock.calls[0][0] as string;
    expect(promptArg).toContain('預提取 KOL 名稱: 謝金河');
    expect(promptArg).toContain('預提取發文日期: 2025年3月21日');
  });

  it('should prefer AI kolName over pre-extracted name', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: '金河兄',
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const content = '謝金河\n\n ·\n追蹤\n2025年3月21日\n ·\n內容...';
    const result = await analyzeDraftContent(content);
    expect(result.kolName).toBe('金河兄');
  });

  it('should not inject hints for regular article text', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    const content = '台積電今天股價大漲，法人看好後市表現。';
    await analyzeDraftContent(content);

    const promptArg = mockGenerateStructuredJson.mock.calls[0][0] as string;
    expect(promptArg).not.toContain('預提取 KOL 名稱');
    expect(promptArg).not.toContain('預提取發文日期');
  });
});

// =====================
// Prompt content verification
// =====================

describe('analyzeDraftContent — prompt improvements', () => {
  it('should include Chinese stock name mappings in prompt', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    await analyzeDraftContent('test content');
    const promptArg = mockGenerateStructuredJson.mock.calls[0][0] as string;
    expect(promptArg).toContain('特斯拉→TSLA');
    expect(promptArg).toContain('蘋果→AAPL');
  });

  it('should include Chinese date format examples in prompt', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    await analyzeDraftContent('test content');
    const promptArg = mockGenerateStructuredJson.mock.calls[0][0] as string;
    expect(promptArg).toContain('2025年3月21日');
    expect(promptArg).toContain('3月21日');
  });

  it('should include social media KOL name patterns in prompt', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    await analyzeDraftContent('test content');
    const promptArg = mockGenerateStructuredJson.mock.calls[0][0] as string;
    expect(promptArg).toContain('追蹤');
    expect(promptArg).toContain('社群媒體貼文格式');
  });
});

// =====================
// Macro Inference (source tracking)
// =====================

describe('analyzeDraftContent — macro inference', () => {
  it('explicit ticker should have source: explicit', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        {
          ticker: '2330.TW',
          name: '台積電',
          market: 'TW',
          confidence: 0.95,
          mentionedAs: '台積電',
          source: 'explicit',
        },
      ],
      sentiment: 2,
      confidence: 0.9,
      reasoning: '看好台積電',
      postedAt: null,
    });

    const result = await analyzeDraftContent('我看好台積電今年的營收成長');
    expect(result.stockTickers).toHaveLength(1);
    expect(result.stockTickers[0].source).toBe('explicit');
    expect(result.stockTickers[0].inferenceReason).toBeUndefined();
  });

  it('inferred ticker should have source: inferred with inferenceReason', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        {
          ticker: 'TLT',
          name: '20+ Year Treasury Bond ETF',
          market: 'US',
          confidence: 0.8,
          mentionedAs: '長天期公債',
          source: 'inferred',
          inferenceReason: 'Fed降息直接影響長天期公債價格',
        },
      ],
      sentiment: 2,
      confidence: 0.85,
      reasoning: '聯準會降息利多公債',
      postedAt: null,
    });

    const result = await analyzeDraftContent('聯準會鮑爾暗示明年可能降息');
    expect(result.stockTickers).toHaveLength(1);
    expect(result.stockTickers[0].ticker).toBe('TLT');
    expect(result.stockTickers[0].source).toBe('inferred');
    expect(result.stockTickers[0].inferenceReason).toBe('Fed降息直接影響長天期公債價格');
  });

  it('mixed post should return both explicit and inferred tickers', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        {
          ticker: '2330.TW',
          name: '台積電',
          market: 'TW',
          confidence: 0.95,
          mentionedAs: '台積電',
          source: 'explicit',
        },
        {
          ticker: 'SMH',
          name: 'VanEck Semiconductor ETF',
          market: 'US',
          confidence: 0.75,
          mentionedAs: '半導體產業',
          source: 'inferred',
          inferenceReason: '半導體產業趨勢最直接反映在半導體類股ETF',
        },
      ],
      sentiment: 2,
      confidence: 0.9,
      reasoning: '看好半導體',
      postedAt: null,
    });

    const result = await analyzeDraftContent('台積電受惠於半導體產業AI需求');
    expect(result.stockTickers).toHaveLength(2);
    expect(result.stockTickers[0].source).toBe('explicit');
    expect(result.stockTickers[1].source).toBe('inferred');
    expect(result.stockTickers[1].inferenceReason).toBeDefined();
  });

  it('no-ticker post should return empty array', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '投資教育內容，無具體標的',
      postedAt: null,
    });

    const result = await analyzeDraftContent('投資要有紀律，不要追高殺低');
    expect(result.stockTickers).toHaveLength(0);
  });

  it('tickers without source field should default to explicit', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [
        {
          ticker: 'AAPL',
          name: 'Apple Inc.',
          market: 'US',
          confidence: 0.9,
          mentionedAs: 'AAPL',
          // no source field — backward compatibility
        },
      ],
      sentiment: 1,
      confidence: 0.8,
      reasoning: '',
      postedAt: null,
    });

    const result = await analyzeDraftContent('AAPL looks good');
    expect(result.stockTickers[0].source).toBe('explicit');
  });

  it('prompt should contain macro inference rules', async () => {
    mockGenerateStructuredJson.mockResolvedValueOnce({
      kolName: null,
      tickers: [],
      sentiment: 0,
      confidence: 0.5,
      reasoning: '',
      postedAt: null,
    });

    await analyzeDraftContent('test');
    const promptArg = mockGenerateStructuredJson.mock.calls[0][0] as string;
    expect(promptArg).toContain('宏觀推論規則');
    expect(promptArg).toContain('inferenceReason');
    expect(promptArg).toContain('0050.TW');
    expect(promptArg).toContain('TLT');
  });
});
