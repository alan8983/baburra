// Post 領域模型

import type { DraftAiArguments } from './draft';

export type Sentiment = -3 | -2 | -1 | 0 | 1 | 2 | 3;
export type SourcePlatform =
  | 'twitter'
  | 'facebook'
  | 'threads'
  | 'instagram'
  | 'youtube'
  | 'youtube_short'
  | 'tiktok'
  | 'manual';

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  [-3]: '強烈看空',
  [-2]: '看空',
  [-1]: '略微看空',
  [0]: '中立',
  [1]: '略微看多',
  [2]: '看多',
  [3]: '強烈看多',
};

export const SENTIMENT_COLORS: Record<Sentiment, string> = {
  [-3]: 'text-red-700 bg-red-200',
  [-2]: 'text-red-600 bg-red-100',
  [-1]: 'text-red-400 bg-red-50',
  [0]: 'text-gray-500 bg-gray-100',
  [1]: 'text-green-400 bg-green-50',
  [2]: 'text-green-600 bg-green-100',
  [3]: 'text-green-700 bg-green-200',
};

export interface Post {
  id: string;
  kolId: string;
  title: string | null;
  content: string;
  sourceUrl: string | null;
  sourcePlatform: SourcePlatform;
  images: string[];
  sentiment: Sentiment;
  sentimentAiGenerated: boolean;
  aiModelVersion: string | null;
  postedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export type TickerSource = 'explicit' | 'inferred';

export interface PostStockLink {
  id: string;
  ticker: string;
  name: string;
  sentiment: Sentiment | null; // null = use post-level sentiment
  source: TickerSource;
  inferenceReason: string | null;
}

export interface PostWithRelations extends Post {
  kol: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  stocks: PostStockLink[];
}

export interface PostWithPriceChanges extends PostWithRelations {
  priceChanges: Record<string, PriceChangeByPeriod>; // stockId -> priceChanges
}

export type PriceChangeStatus = 'pending' | 'no_data' | 'value';

export interface PriceChangeByPeriod {
  day5: number | null;
  day30: number | null;
  day90: number | null;
  day365: number | null;
  day5Status: PriceChangeStatus;
  day30Status: PriceChangeStatus;
  day90Status: PriceChangeStatus;
  day365Status: PriceChangeStatus;
}

export interface StockSourceInfo {
  source: TickerSource;
  inferenceReason?: string;
}

export interface CreatePostInput {
  kolId: string;
  stockIds: string[];
  title?: string;
  content: string;
  sourceUrl?: string;
  sourcePlatform: SourcePlatform;
  images?: string[];
  sentiment: Sentiment;
  stockSentiments?: Record<string, Sentiment>; // stockId -> per-stock sentiment
  stockSources?: Record<string, StockSourceInfo>; // stockId -> source tracking
  sentimentAiGenerated?: boolean;
  aiModelVersion?: string;
  postedAt: Date;
  draftAiArguments?: DraftAiArguments[];
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
  sentiment?: Sentiment;
  stockSentiments?: Record<string, Sentiment | null>; // stockId -> sentiment or null to clear
  images?: string[];
}
