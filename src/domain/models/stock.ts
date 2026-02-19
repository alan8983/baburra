// Stock 領域模型

export type Market = 'US' | 'TW' | 'HK' | 'CRYPTO';

export interface Stock {
  id: string;
  ticker: string;
  name: string;
  logoUrl: string | null;
  market: Market;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockWithStats extends Stock {
  postCount: number;
  returnRate: number | null;
  lastPostAt: Date | null;
}

export interface CreateStockInput {
  ticker: string;
  name: string;
  logoUrl?: string;
  market?: Market;
}

// 股價資料
export interface StockPrice {
  id: string;
  stockId: string;
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  fetchedAt: Date;
}

// K 線圖資料格式 (for Lightweight Charts)
export interface CandlestickData {
  time: string; // YYYY-MM-DD format
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolumeData {
  time: string;
  value: number;
  color?: string;
}

// 股票搜尋結果
export interface StockSearchResult {
  id: string;
  ticker: string;
  name: string;
  logoUrl: string | null;
}
