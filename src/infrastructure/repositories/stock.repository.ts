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

  const { data: stats } = await supabase
    .from('stock_stats')
    .select('stock_id, post_count, last_post_at')
    .in('stock_id', ids);

  const statsByStock = new Map((stats ?? []).map((s) => [s.stock_id as string, s]));

  const data: StockWithStats[] = (rows as DbStock[]).map((r) => {
    const stock = mapDbToStock(r);
    const stat = statsByStock.get(stock.id);
    return {
      ...stock,
      postCount: (stat?.post_count as number) ?? 0,
      returnRate: null,
      lastPostAt: stat?.last_post_at ? new Date(stat.last_post_at as string) : null,
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
  const { data: stat } = await supabase
    .from('stock_stats')
    .select('post_count, last_post_at')
    .eq('stock_id', stock.id)
    .single();

  return {
    ...stock,
    postCount: (stat?.post_count as number) ?? 0,
    returnRate: null,
    lastPostAt: stat?.last_post_at ? new Date(stat.last_post_at as string) : null,
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
