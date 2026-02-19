/**
 * AI 相關 Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants/routes';
import type { Sentiment } from '@/domain/models/post';
import type { DraftAiArguments } from '@/domain/models/draft';

// =====================
// Types
// =====================

export interface AiUsage {
  usageCount: number;
  weeklyLimit: number;
  remaining: number;
  resetAt: string | null;
  subscriptionTier: 'free' | 'premium';
}

export interface SentimentAnalysisResult {
  sentiment: Sentiment;
  confidence: number;
  reasoning: string;
  usage: {
    remaining: number;
    weeklyLimit: number;
    resetAt: string;
  };
}

export interface ExtractArgumentsInput {
  content: string;
  postId: string;
  stocks: {
    id: string;
    ticker: string;
    name: string;
  }[];
}

export interface ExtractedArgument {
  stockId: string;
  ticker: string;
  categoryCode: string;
  summary: string;
  sentiment: number;
}

export interface ExtractArgumentsResult {
  arguments: ExtractedArgument[];
  usage: {
    remaining: number;
    weeklyLimit: number;
    resetAt: string;
  };
}

export interface IdentifiedTicker {
  ticker: string;
  name: string;
  market: 'US' | 'TW' | 'HK' | 'CRYPTO';
  confidence: number;
  mentionedAs: string;
}

export interface TickerIdentificationResult {
  tickers: IdentifiedTicker[];
  usage: {
    remaining: number;
    weeklyLimit: number;
    resetAt: string;
  };
}

export interface ArgumentCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  children?: ArgumentCategory[];
}

// =====================
// AI Usage Hook
// =====================

export function useAiUsage() {
  return useQuery<AiUsage>({
    queryKey: ['ai-usage'],
    queryFn: async () => {
      const res = await fetch(API_ROUTES.AI_USAGE);
      if (!res.ok) throw new Error('Failed to fetch AI usage');
      return res.json();
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

// =====================
// Sentiment Analysis Hook
// =====================

export function useAnalyzeSentiment() {
  const queryClient = useQueryClient();

  return useMutation<SentimentAnalysisResult, Error, string>({
    mutationFn: async (content: string) => {
      const res = await fetch(API_ROUTES.AI_ANALYZE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to analyze sentiment');
      }

      return res.json();
    },
    onSuccess: () => {
      // 更新配額資訊
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] });
    },
  });
}

// =====================
// Extract Arguments Hook
// =====================

export function useExtractArguments() {
  const queryClient = useQueryClient();

  return useMutation<ExtractArgumentsResult, Error, ExtractArgumentsInput>({
    mutationFn: async (input: ExtractArgumentsInput) => {
      const res = await fetch(API_ROUTES.AI_EXTRACT_ARGUMENTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to extract arguments');
      }

      return res.json();
    },
    onSuccess: () => {
      // 更新配額資訊
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] });
    },
  });
}

// =====================
// Ticker Identification Hook
// =====================

export function useIdentifyTickers() {
  const queryClient = useQueryClient();

  return useMutation<TickerIdentificationResult, Error, string>({
    mutationFn: async (content: string) => {
      const res = await fetch(API_ROUTES.AI_IDENTIFY_TICKERS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to identify tickers');
      }

      return res.json();
    },
    onSuccess: () => {
      // 更新配額資訊
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] });
    },
  });
}

// =====================
// Argument Categories Hook
// =====================

export function useArgumentCategories() {
  return useQuery<ArgumentCategory[]>({
    queryKey: ['argument-categories'],
    queryFn: async () => {
      const res = await fetch(API_ROUTES.ARGUMENT_CATEGORIES);
      if (!res.ok) throw new Error('Failed to fetch argument categories');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// =====================
// Extract Draft Arguments Hook
// =====================

export interface ExtractDraftArgumentsInput {
  content: string;
  stocks: { ticker: string; name: string }[];
}

export interface ExtractDraftArgumentsResult {
  arguments: DraftAiArguments[];
  usage: {
    remaining: number;
    weeklyLimit: number;
    resetAt: string;
  };
}

export function useExtractDraftArguments() {
  const queryClient = useQueryClient();

  return useMutation<ExtractDraftArgumentsResult, Error, ExtractDraftArgumentsInput>({
    mutationFn: async (input: ExtractDraftArgumentsInput) => {
      const res = await fetch(API_ROUTES.AI_EXTRACT_DRAFT_ARGUMENTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to extract arguments');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] });
    },
  });
}

// =====================
// Stock Arguments Hook
// =====================

export interface StockArgumentSummary {
  stock: {
    id: string;
    ticker: string;
    name: string;
  };
  summary: {
    parent: {
      id: string;
      code: string;
      name: string;
    };
    totalMentions: number;
    children: {
      category: {
        id: string;
        code: string;
        name: string;
        description: string | null;
      };
      mentionCount: number;
      bullishCount: number;
      bearishCount: number;
      avgSentiment: number | null;
      firstMentionedAt: string | null;
      lastMentionedAt: string | null;
      arguments: {
        id: string;
        postId: string;
        originalText: string | null;
        summary: string | null;
        sentiment: number;
        confidence: number | null;
        createdAt: string;
      }[];
    }[];
  }[];
  totalArgumentCount: number;
}

// =====================
// Post Arguments Hook
// =====================

export interface PostArgumentResponse {
  id: string;
  postId: string;
  stockId: string;
  categoryId: string;
  originalText: string | null;
  summary: string | null;
  sentiment: number;
  confidence: number | null;
  createdAt: string;
  category: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    sentimentDirection: string | null;
    parentId: string | null;
    sortOrder: number;
    createdAt: string;
  };
}

export function usePostArguments(postId: string) {
  return useQuery<PostArgumentResponse[]>({
    queryKey: ['post-arguments', postId],
    queryFn: async () => {
      const res = await fetch(API_ROUTES.POST_ARGUMENTS(postId));
      if (!res.ok) throw new Error('Failed to fetch post arguments');
      return res.json();
    },
    enabled: !!postId,
    staleTime: 60 * 1000,
  });
}

export function useStockArguments(ticker: string) {
  return useQuery<StockArgumentSummary>({
    queryKey: ['stock-arguments', ticker],
    queryFn: async () => {
      const res = await fetch(API_ROUTES.STOCK_ARGUMENTS(ticker));
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Stock not found');
        }
        throw new Error('Failed to fetch stock arguments');
      }
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 60 * 1000, // 1 minute
  });
}
