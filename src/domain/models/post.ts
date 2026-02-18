// Post 領域模型

import type { DraftAiArguments } from './draft';

export type Sentiment = -2 | -1 | 0 | 1 | 2;
export type SourcePlatform = 'twitter' | 'facebook' | 'threads' | 'instagram' | 'manual';

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  [-2]: '強烈看空',
  [-1]: '看空',
  [0]: '中立',
  [1]: '看多',
  [2]: '強烈看多',
};

export const SENTIMENT_COLORS: Record<Sentiment, string> = {
  [-2]: 'text-red-600 bg-red-100',
  [-1]: 'text-red-500 bg-red-50',
  [0]: 'text-gray-500 bg-gray-100',
  [1]: 'text-green-500 bg-green-50',
  [2]: 'text-green-600 bg-green-100',
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
  postedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export interface PostWithRelations extends Post {
  kol: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  stocks: {
    id: string;
    ticker: string;
    name: string;
  }[];
}

export interface PostWithPriceChanges extends PostWithRelations {
  priceChanges: Record<string, PriceChangeByPeriod>; // stockId -> priceChanges
}

export interface PriceChangeByPeriod {
  day5: number | null;
  day30: number | null;
  day90: number | null;
  day365: number | null;
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
  sentimentAiGenerated?: boolean;
  postedAt: Date;
  draftAiArguments?: DraftAiArguments[];
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
  sentiment?: Sentiment;
  images?: string[];
}
