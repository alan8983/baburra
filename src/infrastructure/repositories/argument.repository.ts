/**
 * 論點相關 Repository
 */

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { Sentiment } from '@/domain/models/post';

// =====================
// Types
// =====================

export interface ArgumentCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sentimentDirection: 'bullish' | 'bearish' | 'neutral' | null;
  parentId: string | null;
  sortOrder: number;
  createdAt: Date;
}

export interface PostArgument {
  id: string;
  postId: string;
  stockId: string;
  categoryId: string;
  originalText: string | null;
  summary: string | null;
  sentiment: Sentiment;
  confidence: number | null;
  createdAt: Date;
}

export interface PostArgumentWithCategory extends PostArgument {
  category: ArgumentCategory;
}

export interface StockArgumentSummary {
  id: string;
  stockId: string;
  categoryId: string;
  mentionCount: number;
  bullishCount: number;
  bearishCount: number;
  firstMentionedAt: Date | null;
  lastMentionedAt: Date | null;
  avgSentiment: number | null;
  updatedAt: Date;
}

export interface StockArgumentSummaryWithCategory extends StockArgumentSummary {
  category: ArgumentCategory;
}

export interface CreatePostArgumentInput {
  postId: string;
  stockId: string;
  categoryId: string;
  originalText?: string;
  summary?: string;
  sentiment: Sentiment;
  confidence?: number;
}

// =====================
// Argument Categories
// =====================

/**
 * 取得所有論點類別
 */
export async function getArgumentCategories(): Promise<ArgumentCategory[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('argument_categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to get argument categories: ${error.message}`);
  }

  return (data || []).map(mapArgumentCategory);
}

/**
 * 根據 code 取得論點類別
 */
export async function getArgumentCategoryByCode(code: string): Promise<ArgumentCategory | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('argument_categories')
    .select('*')
    .eq('code', code)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get argument category: ${error.message}`);
  }

  return mapArgumentCategory(data);
}

/**
 * 取得第二層（子層）論點類別
 */
export async function getChildArgumentCategories(): Promise<ArgumentCategory[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('argument_categories')
    .select('*')
    .not('parent_id', 'is', null)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to get child argument categories: ${error.message}`);
  }

  return (data || []).map(mapArgumentCategory);
}

// =====================
// Post Arguments
// =====================

/**
 * 建立文章論點
 */
export async function createPostArgument(input: CreatePostArgumentInput): Promise<PostArgument> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('post_arguments')
    .insert({
      post_id: input.postId,
      stock_id: input.stockId,
      category_id: input.categoryId,
      original_text: input.originalText,
      summary: input.summary,
      sentiment: input.sentiment,
      confidence: input.confidence,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create post argument: ${error.message}`);
  }

  return mapPostArgument(data);
}

/**
 * 批量建立文章論點
 */
export async function createPostArguments(inputs: CreatePostArgumentInput[]): Promise<PostArgument[]> {
  if (inputs.length === 0) return [];

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('post_arguments')
    .insert(
      inputs.map((input) => ({
        post_id: input.postId,
        stock_id: input.stockId,
        category_id: input.categoryId,
        original_text: input.originalText,
        summary: input.summary,
        sentiment: input.sentiment,
        confidence: input.confidence,
      }))
    )
    .select();

  if (error) {
    throw new Error(`Failed to create post arguments: ${error.message}`);
  }

  return (data || []).map(mapPostArgument);
}

/**
 * 取得文章的所有論點
 */
export async function getPostArguments(postId: string): Promise<PostArgumentWithCategory[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('post_arguments')
    .select(
      `
      *,
      category:argument_categories(*)
    `
    )
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to get post arguments: ${error.message}`);
  }

  return (data || []).map((row) => ({
    ...mapPostArgument(row),
    category: mapArgumentCategory(row.category),
  }));
}

/**
 * 取得標的的所有論點
 */
export async function getStockArguments(stockId: string): Promise<PostArgumentWithCategory[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('post_arguments')
    .select(
      `
      *,
      category:argument_categories(*)
    `
    )
    .eq('stock_id', stockId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get stock arguments: ${error.message}`);
  }

  return (data || []).map((row) => ({
    ...mapPostArgument(row),
    category: mapArgumentCategory(row.category),
  }));
}

// =====================
// Stock Argument Summary
// =====================

/**
 * 取得標的的論點彙整
 */
export async function getStockArgumentSummary(
  stockId: string
): Promise<StockArgumentSummaryWithCategory[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('stock_argument_summary')
    .select(
      `
      *,
      category:argument_categories(*)
    `
    )
    .eq('stock_id', stockId)
    .order('mention_count', { ascending: false });

  if (error) {
    throw new Error(`Failed to get stock argument summary: ${error.message}`);
  }

  return (data || []).map((row) => ({
    ...mapStockArgumentSummary(row),
    category: mapArgumentCategory(row.category),
  }));
}

/**
 * 更新標的論點彙整（在新增論點後呼叫）
 */
export async function updateStockArgumentSummary(stockId: string, categoryId: string): Promise<void> {
  const supabase = createAdminClient();

  // 計算該標的該類別的統計資料
  const { data: arguments_data, error: argsError } = await supabase
    .from('post_arguments')
    .select('sentiment, created_at')
    .eq('stock_id', stockId)
    .eq('category_id', categoryId);

  if (argsError) {
    throw new Error(`Failed to get arguments for summary: ${argsError.message}`);
  }

  const args = arguments_data || [];

  if (args.length === 0) {
    // 如果沒有論點，刪除彙整記錄
    await supabase
      .from('stock_argument_summary')
      .delete()
      .eq('stock_id', stockId)
      .eq('category_id', categoryId);
    return;
  }

  // 計算統計資料
  const mentionCount = args.length;
  const bullishCount = args.filter((a) => a.sentiment > 0).length;
  const bearishCount = args.filter((a) => a.sentiment < 0).length;
  const avgSentiment = args.reduce((sum, a) => sum + a.sentiment, 0) / args.length;
  const dates = args.map((a) => new Date(a.created_at)).sort((a, b) => a.getTime() - b.getTime());
  const firstMentionedAt = dates[0];
  const lastMentionedAt = dates[dates.length - 1];

  // Upsert 彙整記錄
  const { error: upsertError } = await supabase.from('stock_argument_summary').upsert(
    {
      stock_id: stockId,
      category_id: categoryId,
      mention_count: mentionCount,
      bullish_count: bullishCount,
      bearish_count: bearishCount,
      first_mentioned_at: firstMentionedAt.toISOString(),
      last_mentioned_at: lastMentionedAt.toISOString(),
      avg_sentiment: avgSentiment,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'stock_id,category_id',
    }
  );

  if (upsertError) {
    throw new Error(`Failed to upsert stock argument summary: ${upsertError.message}`);
  }
}

// =====================
// Mappers
// =====================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapArgumentCategory(row: any): ArgumentCategory {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    sentimentDirection: row.sentiment_direction,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPostArgument(row: any): PostArgument {
  return {
    id: row.id,
    postId: row.post_id,
    stockId: row.stock_id,
    categoryId: row.category_id,
    originalText: row.original_text,
    summary: row.summary,
    sentiment: row.sentiment as Sentiment,
    confidence: row.confidence,
    createdAt: new Date(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStockArgumentSummary(row: any): StockArgumentSummary {
  return {
    id: row.id,
    stockId: row.stock_id,
    categoryId: row.category_id,
    mentionCount: row.mention_count,
    bullishCount: row.bullish_count,
    bearishCount: row.bearish_count,
    firstMentionedAt: row.first_mentioned_at ? new Date(row.first_mentioned_at) : null,
    lastMentionedAt: row.last_mentioned_at ? new Date(row.last_mentioned_at) : null,
    avgSentiment: row.avg_sentiment,
    updatedAt: new Date(row.updated_at),
  };
}
