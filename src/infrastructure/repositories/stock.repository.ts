// Stock Repository - 僅標的 CRUD，不含股價

import { createAdminClient } from '@/infrastructure/supabase/admin';
import { escapePostgrestSearch } from '@/lib/api/search';
import type { Stock, StockWithStats, CreateStockInput, StockSearchResult } from '@/domain/models';

type DbStock = {
  id: string;
  ticker: string;
  name: string;
  logo_url: string | null;
  market: string;
  created_at: string;
  updated_at: string;
};

function mapDbToStock(row: DbStock): Stock {
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    logoUrl: row.logo_url ?? null,
    market: row.market as Stock['market'],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function listStocks(params: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: StockWithStats[]; total: number }> {
  const supabase = createAdminClient();
  const { search = '', page = 1, limit = 20 } = params;

  let query = supabase.from('stocks').select('*', { count: 'exact', head: false });

  if (search.trim()) {
    const s = escapePostgrestSearch(search.trim());
    query = query.or(`ticker.ilike.%${s}%,name.ilike.%${s}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const {
    data: rows,
    count,
    error,
  } = await query.order('updated_at', { ascending: false }).range(from, to);

  if (error) throw new Error(error.message);

  const ids = (rows as DbStock[]).map((r) => r.id);
  if (ids.length === 0) {
    return { data: [], total: count ?? 0 };
  }

  const { data: postStocks } = await supabase
    .from('post_stocks')
    .select('stock_id, post_id')
    .in('stock_id', ids);
  const countByStock: Record<string, number> = {};
  const postIdsByStock: Record<string, string[]> = {};
  for (const ps of postStocks ?? []) {
    const sid = ps.stock_id as string;
    countByStock[sid] = (countByStock[sid] ?? 0) + 1;
    if (!postIdsByStock[sid]) postIdsByStock[sid] = [];
    postIdsByStock[sid].push(ps.post_id as string);
  }

  const allPostIds = [...new Set((postStocks ?? []).map((p) => p.post_id as string))];
  const lastPostByStock: Record<string, string> = {};
  if (allPostIds.length > 0) {
    const { data: posts } = await supabase
      .from('posts')
      .select('id, posted_at')
      .in('id', allPostIds);
    const postDateById: Record<string, string> = {};
    for (const p of posts ?? []) {
      postDateById[p.id as string] = p.posted_at as string;
    }
    for (const sid of ids) {
      const pids = postIdsByStock[sid] ?? [];
      const dates = pids.map((pid) => postDateById[pid]).filter(Boolean);
      if (dates.length > 0) lastPostByStock[sid] = dates.sort().reverse()[0];
    }
  }

  const data: StockWithStats[] = (rows as DbStock[]).map((r) => {
    const stock = mapDbToStock(r);
    return {
      ...stock,
      postCount: countByStock[stock.id] ?? 0,
      returnRate: null,
      lastPostAt: lastPostByStock[stock.id] ? new Date(lastPostByStock[stock.id]) : null,
    };
  });

  return { data, total: count ?? 0 };
}

export async function getStockByTicker(ticker: string): Promise<StockWithStats | null> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('stocks')
    .select('*')
    .eq('ticker', ticker)
    .single();
  if (error || !row) return null;

  const stock = mapDbToStock(row as DbStock);
  const { count } = await supabase
    .from('post_stocks')
    .select('*', { count: 'exact', head: true })
    .eq('stock_id', stock.id);

  const { data: postLinks } = await supabase
    .from('post_stocks')
    .select('post_id')
    .eq('stock_id', stock.id);
  const postIds = (postLinks ?? []).map((p) => p.post_id as string);
  let lastPostAt: Date | null = null;
  if (postIds.length > 0) {
    const { data: lastPost } = await supabase
      .from('posts')
      .select('posted_at')
      .in('id', postIds)
      .order('posted_at', { ascending: false })
      .limit(1)
      .single();
    if (lastPost?.posted_at) lastPostAt = new Date(lastPost.posted_at as string);
  }

  return {
    ...stock,
    postCount: count ?? 0,
    returnRate: null,
    lastPostAt,
  };
}

export async function createStock(input: CreateStockInput): Promise<Stock> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('stocks')
    .insert({
      ticker: input.ticker.trim().toUpperCase(),
      name: input.name,
      logo_url: input.logoUrl ?? null,
      market: input.market ?? 'US',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapDbToStock(row as DbStock);
}

export function toStockSearchResult(stock: Stock): StockSearchResult {
  return { id: stock.id, ticker: stock.ticker, name: stock.name, logoUrl: stock.logoUrl };
}
