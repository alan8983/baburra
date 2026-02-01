// KOL Repository - 使用 Supabase Admin Client（繞過 RLS）

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { KOL, KOLWithStats, CreateKOLInput, UpdateKOLInput, KOLSearchResult } from '@/domain/models';

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
    query = query.or(`name.ilike.%${search.trim()}%,slug.ilike.%${search.trim()}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data: rows, count, error } = await query.order('updated_at', { ascending: false }).range(from, to);

  if (error) throw new Error(error.message);

  const ids = (rows as DbKol[]).map((r) => r.id);
  if (ids.length === 0) {
    return { data: [], total: count ?? 0 };
  }

  const { data: postStats } = await supabase
    .from('posts')
    .select('kol_id')
    .in('kol_id', ids);

  const countByKol: Record<string, number> = {};
  const lastPostByKol: Record<string, string> = {};
  for (const p of postStats ?? []) {
    const kid = p.kol_id as string;
    countByKol[kid] = (countByKol[kid] ?? 0) + 1;
  }

  const { data: lastPosts } = await supabase
    .from('posts')
    .select('kol_id, posted_at')
    .in('kol_id', ids)
    .order('posted_at', { ascending: false });

  for (const p of lastPosts ?? []) {
    const kid = p.kol_id as string;
    if (!lastPostByKol[kid]) lastPostByKol[kid] = p.posted_at as string;
  }

  const data: KOLWithStats[] = (rows as DbKol[]).map((r) => {
    const kol = mapDbToKol(r);
    return {
      ...kol,
      postCount: countByKol[kol.id] ?? 0,
      winRate: null,
      lastPostAt: lastPostByKol[kol.id] ? new Date(lastPostByKol[kol.id]) : null,
    };
  });

  return { data, total: count ?? 0 };
}

export async function getKolById(id: string): Promise<KOLWithStats | null> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase.from('kols').select('*').eq('id', id).single();
  if (error || !row) return null;

  const kol = mapDbToKol(row as DbKol);
  const { count } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('kol_id', id);
  const { data: lastPost } = await supabase
    .from('posts')
    .select('posted_at')
    .eq('kol_id', id)
    .order('posted_at', { ascending: false })
    .limit(1)
    .single();

  return {
    ...kol,
    postCount: count ?? 0,
    winRate: null,
    lastPostAt: lastPost?.posted_at ? new Date(lastPost.posted_at as string) : null,
  };
}

export async function createKol(input: CreateKOLInput): Promise<KOL> {
  const supabase = createAdminClient();
  const baseSlug = generateSlug(input.name);
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const { data: existing } = await supabase.from('kols').select('id').eq('slug', slug).maybeSingle();
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

export async function updateKol(id: string, input: UpdateKOLInput): Promise<KOL | null> {
  const supabase = createAdminClient();
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.avatarUrl !== undefined) payload.avatar_url = input.avatarUrl;
  if (input.bio !== undefined) payload.bio = input.bio;
  if (input.socialLinks !== undefined) payload.social_links = input.socialLinks;
  if (Object.keys(payload).length === 0) return getKolById(id).then((k) => (k ? { ...k } : null));

  const { data: row, error } = await supabase.from('kols').update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return row ? mapDbToKol(row as DbKol) : null;
}

export function toKOLSearchResult(kol: KOL): KOLSearchResult {
  return { id: kol.id, name: kol.name, avatarUrl: kol.avatarUrl };
}
