// Draft Repository - 草稿 CRUD

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type {
  Draft,
  DraftWithRelations,
  CreateDraftInput,
  UpdateDraftInput,
} from '@/domain/models';

type DbDraft = {
  id: string;
  user_id: string;
  kol_id: string | null;
  kol_name_input: string | null;
  content: string | null;
  source_url: string | null;
  images: string[];
  sentiment: number | null;
  posted_at: string | null;
  stock_ids: string[];
  stock_name_inputs: string[];
  created_at: string;
  updated_at: string;
};

function mapDbToDraft(row: DbDraft): Draft {
  return {
    id: row.id,
    userId: row.user_id,
    kolId: row.kol_id ?? null,
    kolNameInput: row.kol_name_input ?? null,
    content: row.content ?? null,
    sourceUrl: row.source_url ?? null,
    images: Array.isArray(row.images) ? row.images : [],
    sentiment: row.sentiment as Draft['sentiment'],
    postedAt: row.posted_at ? new Date(row.posted_at) : null,
    stockIds: Array.isArray(row.stock_ids) ? row.stock_ids : [],
    stockNameInputs: Array.isArray(row.stock_name_inputs) ? row.stock_name_inputs : [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function listDraftsByUserId(
  userId: string,
  params?: { page?: number; limit?: number }
): Promise<{ data: DraftWithRelations[]; total: number }> {
  const supabase = createAdminClient();
  const { page = 1, limit = 50 } = params ?? {};

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data: rows, count, error } = await supabase
    .from('drafts')
    .select('*', { count: 'exact', head: false })
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  if (!rows?.length) return { data: [], total: count ?? 0 };

  const drafts = (rows as DbDraft[]).map(mapDbToDraft);
  const kolIds = [...new Set(drafts.map((d) => d.kolId).filter(Boolean))] as string[];
  const stockIds = [...new Set(drafts.flatMap((d) => d.stockIds))];

  const [kolRows, stockRows] = await Promise.all([
    kolIds.length ? supabase.from('kols').select('id, name, avatar_url').in('id', kolIds) : { data: [] },
    stockIds.length ? supabase.from('stocks').select('id, ticker, name').in('id', stockIds) : { data: [] },
  ]);

  const kolMap: Record<string, { id: string; name: string; avatarUrl: string | null }> = {};
  for (const k of kolRows.data ?? []) {
    kolMap[k.id as string] = {
      id: k.id as string,
      name: k.name as string,
      avatarUrl: (k.avatar_url as string) ?? null,
    };
  }
  const stockMap: Record<string, { id: string; ticker: string; name: string }> = {};
  for (const s of stockRows.data ?? []) {
    stockMap[s.id as string] = {
      id: s.id as string,
      ticker: s.ticker as string,
      name: s.name as string,
    };
  }

  const data: DraftWithRelations[] = drafts.map((d) => ({
    ...d,
    kol: d.kolId ? kolMap[d.kolId] ?? null : null,
    stocks: d.stockIds.map((sid) => stockMap[sid]).filter(Boolean),
  }));

  return { data, total: count ?? 0 };
}

export async function getDraftById(id: string, userId: string): Promise<DraftWithRelations | null> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('drafts')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !row) return null;
  const draft = mapDbToDraft(row as DbDraft);

  let kol: DraftWithRelations['kol'] = null;
  if (draft.kolId) {
    const { data: k } = await supabase.from('kols').select('id, name, avatar_url').eq('id', draft.kolId).single();
    if (k) kol = { id: k.id as string, name: k.name as string, avatarUrl: (k.avatar_url as string) ?? null };
  }

  const stocks: DraftWithRelations['stocks'] = [];
  if (draft.stockIds.length > 0) {
    const { data: sRows } = await supabase.from('stocks').select('id, ticker, name').in('id', draft.stockIds);
    for (const s of sRows ?? []) {
      stocks.push({ id: s.id as string, ticker: s.ticker as string, name: s.name as string });
    }
  }

  return { ...draft, kol, stocks };
}

export async function createDraft(userId: string, input: CreateDraftInput): Promise<Draft> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('drafts')
    .insert({
      user_id: userId,
      kol_id: input.kolId ?? null,
      kol_name_input: input.kolNameInput ?? null,
      content: input.content ?? null,
      source_url: input.sourceUrl ?? null,
      images: input.images ?? [],
      sentiment: input.sentiment ?? null,
      posted_at: input.postedAt ? (input.postedAt instanceof Date ? input.postedAt.toISOString() : input.postedAt) : null,
      stock_ids: input.stockIds ?? [],
      stock_name_inputs: input.stockNameInputs ?? [],
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapDbToDraft(row as DbDraft);
}

export async function updateDraft(
  id: string,
  userId: string,
  input: UpdateDraftInput
): Promise<DraftWithRelations | null> {
  const supabase = createAdminClient();
  const payload: Record<string, unknown> = {};
  if (input.kolId !== undefined) payload.kol_id = input.kolId;
  if (input.kolNameInput !== undefined) payload.kol_name_input = input.kolNameInput;
  if (input.content !== undefined) payload.content = input.content;
  if (input.sourceUrl !== undefined) payload.source_url = input.sourceUrl;
  if (input.images !== undefined) payload.images = input.images;
  if (input.sentiment !== undefined) payload.sentiment = input.sentiment;
  if (input.postedAt !== undefined)
    payload.posted_at = input.postedAt
      ? input.postedAt instanceof Date
        ? input.postedAt.toISOString()
        : input.postedAt
      : null;
  if (input.stockIds !== undefined) payload.stock_ids = input.stockIds;
  if (input.stockNameInputs !== undefined) payload.stock_name_inputs = input.stockNameInputs;
  if (Object.keys(payload).length === 0) return getDraftById(id, userId);

  const { error } = await supabase.from('drafts').update(payload).eq('id', id).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return getDraftById(id, userId);
}

export async function deleteDraft(id: string, userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('drafts').delete().eq('id', id).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return true;
}
