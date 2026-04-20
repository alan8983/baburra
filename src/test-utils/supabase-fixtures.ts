/**
 * Supabase fixtures for repository ownership integration tests.
 *
 * These helpers insert real rows via the admin client so tests can exercise
 * mutating repository functions end-to-end and verify that ownership filters
 * actually reject cross-user access at the SQL layer.
 *
 * Tests using these fixtures must be skipped when Supabase env vars are
 * missing — use `hasIntegrationEnv()` with `describe.skipIf`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

/**
 * True when the env vars required to hit a real Supabase instance are set.
 * Integration tests should skip when this returns false so CI and local runs
 * without a DB don't fail loudly — they skip loudly instead.
 */
export function hasIntegrationEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let _client: SupabaseClient | null = null;

function adminClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

/** Short unique suffix to avoid collisions when fixtures run in parallel. */
function uniq(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export interface TestUser {
  userId: string;
  email: string;
  cleanup: () => Promise<void>;
}

/**
 * Create a test auth user (and the profile row that the `handle_new_user`
 * trigger inserts). Returns the user id and a cleanup closure.
 */
export async function createTestUser(): Promise<TestUser> {
  const supabase = adminClient();
  const email = `${uniq('ownership-test')}@fixtures.baburra.test`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message ?? 'no user returned'}`);
  }
  const userId = data.user.id;

  return {
    userId,
    email,
    cleanup: async () => {
      // Deleting the auth user cascades to profiles and any user-scoped row
      // whose FK uses ON DELETE CASCADE (drafts, bookmarks, subscriptions).
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
    },
  };
}

export interface TestKol {
  id: string;
  cleanup: () => Promise<void>;
}

export async function createTestKol(createdBy: string): Promise<TestKol> {
  const supabase = adminClient();
  const name = uniq('KolFixture');
  const slug = name.toLowerCase();
  const { data, error } = await supabase
    .from('kols')
    .insert({ name, slug, created_by: createdBy })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createTestKol failed: ${error?.message}`);
  const id = data.id as string;
  return {
    id,
    cleanup: async () => {
      await supabase.from('kols').delete().eq('id', id);
    },
  };
}

export interface TestPost {
  id: string;
  cleanup: () => Promise<void>;
}

export async function createTestPost(params: {
  kolId: string;
  createdBy: string;
  content?: string;
  sentiment?: number;
}): Promise<TestPost> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('posts')
    .insert({
      kol_id: params.kolId,
      created_by: params.createdBy,
      content: params.content ?? 'fixture content',
      sentiment: params.sentiment ?? 0,
      posted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createTestPost failed: ${error?.message}`);
  const id = data.id as string;
  return {
    id,
    cleanup: async () => {
      await supabase.from('posts').delete().eq('id', id);
    },
  };
}

export interface TestDraft {
  id: string;
  cleanup: () => Promise<void>;
}

export async function createTestDraft(userId: string): Promise<TestDraft> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('drafts')
    .insert({ user_id: userId, content: 'draft fixture' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createTestDraft failed: ${error?.message}`);
  const id = data.id as string;
  return {
    id,
    cleanup: async () => {
      await supabase.from('drafts').delete().eq('id', id);
    },
  };
}

export interface TestKolSource {
  id: string;
  cleanup: () => Promise<void>;
}

/**
 * Create a kol_source row so subscriptions can be tested. Ties to a KOL
 * fixture; cleanup removes the source row (kol is cleaned up separately).
 */
export async function createTestKolSource(kolId: string): Promise<TestKolSource> {
  const supabase = adminClient();
  const platformId = uniq('platform');
  const { data, error } = await supabase
    .from('kol_sources')
    .insert({
      kol_id: kolId,
      platform: 'manual',
      platform_id: platformId,
      platform_url: `https://example.test/${platformId}`,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createTestKolSource failed: ${error?.message}`);
  const id = data.id as string;
  return {
    id,
    cleanup: async () => {
      await supabase.from('kol_sources').delete().eq('id', id);
    },
  };
}
