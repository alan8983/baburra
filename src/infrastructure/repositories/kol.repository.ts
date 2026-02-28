// KOL Repository - 使用 Supabase Admin Client（繞過 RLS）

import { createAdminClient } from '@/infrastructure/supabase/admin';
import { escapePostgrestSearch } from '@/lib/api/search';
import type {
  KOL,
  KOLWithStats,
  CreateKOLInput,
  UpdateKOLInput,
  KOLSearchResult,
} from '@/domain/models';

type DbKol = {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  bio: string | null;
  social_links: Record<string, string>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function mapDbToKol(row: DbKol): KOL {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    socialLinks: (row.social_links as Record<string, string>) ?? {},
    createdBy: row.created_by ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '');
}

export async function listKols(params: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: KOLWithStats[]; total: number }> {
  const supabase = createAdminClient();
  const { search = '', page = 1, limit = 20 } = params;

  let query = supabase.from('kols').select('*', { count: 'exact', head: false });

  if (search.trim()) {
    const s = escapePostgrestSearch(search.trim());
    query = query.or(`name.ilike.%${s}%,slug.ilike.%${s}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const {
    data: rows,
    count,
    error,
  } = await query.order('updated_at', { ascending: false }).range(from, to);

  if (error) throw new Error(error.message);

  const ids = (rows as DbKol[]).map((r) => r.id);
  if (ids.length === 0) {
    return { data: [], total: count ?? 0 };
  }

  const { data: stats } = await supabase
    .from('kol_stats')
    .select('kol_id, post_count, last_post_at')
    .in('kol_id', ids);

  const statsByKol = new Map((stats ?? []).map((s) => [s.kol_id as string, s]));

  const data: KOLWithStats[] = (rows as DbKol[]).map((r) => {
    const kol = mapDbToKol(r);
    const stat = statsByKol.get(kol.id);
    return {
      ...kol,
      postCount: (stat?.post_count as number) ?? 0,
      returnRate: null,
      lastPostAt: stat?.last_post_at ? new Date(stat.last_post_at as string) : null,
    };
  });

  return { data, total: count ?? 0 };
}

export async function getKolById(id: string): Promise<KOLWithStats | null> {
  const supabase = createAdminClient();
  const [{ data: row, error }, { data: stat }] = await Promise.all([
    supabase.from('kols').select('*').eq('id', id).single(),
    supabase.from('kol_stats').select('post_count, last_post_at').eq('kol_id', id).single(),
  ]);
  if (error || !row) return null;

  const kol = mapDbToKol(row as DbKol);
  return {
    ...kol,
    postCount: (stat?.post_count as number) ?? 0,
    returnRate: null,
    lastPostAt: stat?.last_post_at ? new Date(stat.last_post_at as string) : null,
  };
}

export async function createKol(input: CreateKOLInput): Promise<KOL> {
  const supabase = createAdminClient();
  const baseSlug = generateSlug(input.name);
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const { data: existing } = await supabase
      .from('kols')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) break;
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  const { data: row, error } = await supabase
    .from('kols')
    .insert({
      name: input.name,
      slug,
      avatar_url: input.avatarUrl ?? null,
      bio: input.bio ?? null,
      social_links: input.socialLinks ?? {},
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapDbToKol(row as DbKol);
}

export async function updateKol(
  id: string,
  userId: string,
  input: UpdateKOLInput
): Promise<KOL | null> {
  const supabase = createAdminClient();
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.avatarUrl !== undefined) payload.avatar_url = input.avatarUrl;
  if (input.bio !== undefined) payload.bio = input.bio;
  if (input.socialLinks !== undefined) payload.social_links = input.socialLinks;
  if (Object.keys(payload).length === 0) return getKolById(id).then((k) => (k ? { ...k } : null));

  const { data: row, error } = await supabase
    .from('kols')
    .update(payload)
    .eq('id', id)
    .eq('created_by', userId)
    .select()
    .single();
  if (error) {
    // PGRST116 = "no rows returned" — means KOL not found or not owned by user
    if (error.code === 'PGRST116') return null;
    throw new Error(error.message);
  }
  return row ? mapDbToKol(row as DbKol) : null;
}

export async function findKolByName(name: string): Promise<KOLSearchResult | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('kols')
    .select('id, name, avatar_url')
    .ilike('name', trimmed)
    .limit(1)
    .maybeSingle();

  if (error || !row) return null;
  return { id: row.id, name: row.name, avatarUrl: row.avatar_url };
}

export function toKOLSearchResult(kol: KOL): KOLSearchResult {
  return { id: kol.id, name: kol.name, avatarUrl: kol.avatarUrl };
}
