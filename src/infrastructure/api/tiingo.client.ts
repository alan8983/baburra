/**
 * Tiingo End-of-Day Stock Price API 客戶端
 * @see https://www.tiingo.com/documentation/end-of-day
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

function getToken(): string {
  const token = process.env.TIINGO_API_TOKEN ?? process.env.TIINGO_API_KEY;
  if (!token) {
    throw new Error('TIINGO_API_TOKEN or TIINGO_API_KEY is not set');
  }
  return token;
}

/**
 * 取得標的的日線股價（可指定日期區間）
 */
export async function fetchTiingoPrices(
  ticker: string,
  options?: { startDate?: string; endDate?: string }
): Promise<TiingoPriceRow[]> {
  const token = getToken();
  const params = new URLSearchParams({ token });
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);

  const url = `${TIINGO_BASE}/${encodeURIComponent(ticker)}/prices?${params.toString()}`;
  const res = await fetch(url, { next: { revalidate: 0 } });

  if (!res.ok) {
    if (res.status === 404) return [];
    const text = await res.text();
    throw new Error(`Tiingo API error ${res.status}: ${text || res.statusText}`);
  }

  const data = (await res.json()) as TiingoPriceRow[];
  return Array.isArray(data) ? data : [];
}
