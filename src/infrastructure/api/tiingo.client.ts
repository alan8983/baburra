/**
 * Tiingo Stock & Crypto Price API 客戶端
 * @see https://www.tiingo.com/documentation/end-of-day
 * @see https://www.tiingo.com/documentation/crypto
 */

export interface TiingoPriceRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjOpen?: number;
  adjHigh?: number;
  adjLow?: number;
  adjClose?: number;
  adjVolume?: number;
}

const TIINGO_BASE = 'https://api.tiingo.com/tiingo/daily';
const TIINGO_CRYPTO_BASE = 'https://api.tiingo.com/tiingo/crypto';

function getToken(): string {
  const token = process.env.TIINGO_API_TOKEN ?? process.env.TIINGO_API_KEY;
  if (!token) {
    throw new Error('TIINGO_API_TOKEN or TIINGO_API_KEY is not set');
  }
  return token;
}

/**
 * 取得標的的日線股價（可指定日期區間）
 * 根據 market 類型自動選擇 equities 或 crypto endpoint
 */
export async function fetchTiingoPrices(
  ticker: string,
  options?: { startDate?: string; endDate?: string; market?: string }
): Promise<TiingoPriceRow[]> {
  if (options?.market === 'CRYPTO') {
    return fetchCryptoPrices(ticker, options);
  }

  const token = getToken();
  const params = new URLSearchParams({ token });
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);

  const url = `${TIINGO_BASE}/${encodeURIComponent(ticker)}/prices?${params.toString()}`;
  const res = await fetch(url, { next: { revalidate: 0 } });

  if (!res.ok) {
    if (res.status === 404) {
      console.warn(`[Tiingo] Ticker not found (404): ${ticker}`);
      return [];
    }
    const text = await res.text();
    throw new Error(`Tiingo API error ${res.status}: ${text || res.statusText}`);
  }

  const data = (await res.json()) as TiingoPriceRow[];
  return Array.isArray(data) ? data : [];
}

/**
 * 取得加密貨幣的日線價格
 * Tiingo crypto endpoint 回傳格式不同，需要轉換
 * @see https://www.tiingo.com/documentation/crypto
 */
async function fetchCryptoPrices(
  ticker: string,
  options?: { startDate?: string; endDate?: string }
): Promise<TiingoPriceRow[]> {
  const token = getToken();
  const cryptoTicker = `${ticker.toLowerCase()}usd`;
  const params = new URLSearchParams({
    token,
    tickers: cryptoTicker,
    resampleFreq: '1day',
  });
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);

  const url = `${TIINGO_CRYPTO_BASE}/prices?${params.toString()}`;
  const res = await fetch(url, { next: { revalidate: 0 } });

  if (!res.ok) {
    if (res.status === 404) {
      console.warn(`[Tiingo Crypto] Ticker not found (404): ${cryptoTicker}`);
      return [];
    }
    const text = await res.text();
    throw new Error(`Tiingo Crypto API error ${res.status}: ${text || res.statusText}`);
  }

  // Tiingo crypto returns: [{ ticker, baseCurrency, ..., priceData: [{date, open, high, low, close, volume, ...}] }]
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return [];

  const priceData = data[0]?.priceData;
  if (!Array.isArray(priceData) || priceData.length === 0) return [];

  return priceData.map(
    (row: {
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }) => ({
      date: row.date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    })
  );
}
