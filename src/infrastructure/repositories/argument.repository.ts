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

export interface KolInfo {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface PostArgumentWithCategoryAndKol extends PostArgumentWithCategory {
  kol: KolInfo;
}

export interface ComputedCategorySummary {
  categoryId: string;
  mentionCount: number;
  bullishCount: number;
  bearishCount: number;
  avgSentiment: number | null;
  firstMentionedAt: Date | null;
  lastMentionedAt: Date | null;
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
export async function createPostArguments(
  inputs: CreatePostArgumentInput[]
): Promise<PostArgument[]> {
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
 * 替換文章的所有論點（先刪後建）
 */
export async function replacePostArguments(
  postId: string,
  args: {
    stockId: string;
    categoryCode: string;
    originalText: string;
    summary: string;
    sentiment: number;
    confidence: number;
  }[]
): Promise<void> {
  const supabase = createAdminClient();

  // Delete existing arguments for this post
  const { error: deleteError } = await supabase
    .from('post_arguments')
    .delete()
    .eq('post_id', postId);

  if (deleteError) {
    throw new Error(`Failed to delete post arguments: ${deleteError.message}`);
  }

  if (args.length === 0) return;

  // Resolve category codes to category IDs
  const uniqueCodes = [...new Set(args.map((a) => a.categoryCode))];
  const { data: categories, error: catError } = await supabase
    .from('argument_categories')
    .select('id, code')
    .in('code', uniqueCodes);

  if (catError) {
    throw new Error(`Failed to resolve argument categories: ${catError.message}`);
  }

  const codeToId = new Map<string, string>();
  for (const cat of categories || []) {
    codeToId.set(cat.code as string, cat.id as string);
  }

  // Filter out args with unresolved categories and insert
  const inserts = args
    .filter((a) => codeToId.has(a.categoryCode))
    .map((a) => ({
      post_id: postId,
      stock_id: a.stockId,
      category_id: codeToId.get(a.categoryCode)!,
      original_text: a.originalText,
      summary: a.summary,
      sentiment: a.sentiment,
      confidence: a.confidence,
    }));

  if (inserts.length === 0) return;

  const { error: insertError } = await supabase.from('post_arguments').insert(inserts);

  if (insertError) {
    throw new Error(`Failed to insert post arguments: ${insertError.message}`);
  }
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
 * 取得標的的所有論點（限定使用者，含 KOL 資訊）
 */
export async function getStockArguments(
  stockId: string,
  userId: string
): Promise<PostArgumentWithCategoryAndKol[]> {
  const supabase = createAdminClient();

  // Step 1: get user's post IDs for this stock
  const { data: postRows, error: postError } = await supabase
    .from('posts')
    .select('id, kol_id')
    .eq('created_by', userId);

  if (postError) {
    throw new Error(`Failed to get user posts: ${postError.message}`);
  }

  const userPostIds = (postRows || []).map((p) => p.id as string);
  if (userPostIds.length === 0) return [];

  // Step 2: get arguments for these posts filtered by stock
  const { data, error } = await supabase
    .from('post_arguments')
    .select(
      `
      *,
      category:argument_categories(*),
      post:posts!inner(id, kol_id, kols(id, name, avatar_url))
    `
    )
    .eq('stock_id', stockId)
    .in('post_id', userPostIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get stock arguments: ${error.message}`);
  }

  return (data || []).map((row) => ({
    ...mapPostArgument(row),
    category: mapArgumentCategory(row.category),
    kol: mapKolInfo(row.post?.kols),
  }));
}

// =====================
// Computed Summary (replaces stock_argument_summary table)
// =====================

/**
 * 即時計算標的論點彙整（依使用者）
 */
export async function computeStockArgumentSummary(
  stockId: string,
  userId: string
): Promise<ComputedCategorySummary[]> {
  const args = await getStockArguments(stockId, userId);

  // Group by categoryId
  const grouped = new Map<string, PostArgumentWithCategoryAndKol[]>();
  for (const arg of args) {
    const group = grouped.get(arg.categoryId) ?? [];
    group.push(arg);
    grouped.set(arg.categoryId, group);
  }

  return Array.from(grouped.entries()).map(([categoryId, categoryArgs]) => {
    const dates = categoryArgs.map((a) => a.createdAt).sort((a, b) => a.getTime() - b.getTime());

    return {
      categoryId,
      mentionCount: categoryArgs.length,
      bullishCount: categoryArgs.filter((a) => a.sentiment > 0).length,
      bearishCount: categoryArgs.filter((a) => a.sentiment < 0).length,
      avgSentiment:
        categoryArgs.length > 0
          ? categoryArgs.reduce((sum, a) => sum + a.sentiment, 0) / categoryArgs.length
          : null,
      firstMentionedAt: dates[0] ?? null,
      lastMentionedAt: dates[dates.length - 1] ?? null,
    };
  });
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
function mapKolInfo(row: any): KolInfo {
  return {
    id: row?.id ?? '',
    name: row?.name ?? 'Unknown',
    avatarUrl: row?.avatar_url ?? null,
  };
}
