// Subscription Repository — CRUD for kol_subscriptions table

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { KolSubscription } from '@/domain/models';

type DbKolSubscription = {
  id: string;
  user_id: string;
  kol_source_id: string;
  notify_new_posts: boolean;
  created_at: string;
};

function mapDbToSubscription(row: DbKolSubscription): KolSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    kolSourceId: row.kol_source_id,
    notifyNewPosts: row.notify_new_posts,
    createdAt: new Date(row.created_at),
  };
}

export async function subscribe(userId: string, sourceId: string): Promise<KolSubscription> {
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from('kol_subscriptions')
    .upsert({ user_id: userId, kol_source_id: sourceId }, { onConflict: 'user_id,kol_source_id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapDbToSubscription(row as DbKolSubscription);
}

export async function unsubscribe(userId: string, sourceId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('kol_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('kol_source_id', sourceId);

  if (error) throw new Error(error.message);
  return true;
}

export async function getUserSubscriptions(userId: string): Promise<KolSubscription[]> {
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from('kol_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (rows as DbKolSubscription[]).map(mapDbToSubscription);
}

export async function getUserSubscriptionCount(userId: string): Promise<number> {
  const supabase = createAdminClient();

  const { count, error } = await supabase
    .from('kol_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getSubscriberCount(sourceId: string): Promise<number> {
  const supabase = createAdminClient();

  const { count, error } = await supabase
    .from('kol_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('kol_source_id', sourceId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function hasSubscribers(sourceId: string): Promise<boolean> {
  const count = await getSubscriberCount(sourceId);
  return count > 0;
}

// ── Enriched queries for API responses ──

export interface EnrichedSubscription {
  id: string;
  kolSourceId: string;
  kolId: string;
  kolName: string;
  kolAvatarUrl: string | null;
  platform: string;
  platformId: string;
  platformUrl: string;
  monitoringEnabled: boolean;
  lastScrapedAt: string | null;
  createdAt: string;
}

type DbEnrichedSubscription = {
  id: string;
  kol_source_id: string;
  created_at: string;
  kol_sources: {
    id: string;
    kol_id: string;
    platform: string;
    platform_id: string;
    platform_url: string;
    monitoring_enabled: boolean;
    last_scraped_at: string | null;
    kols: {
      id: string;
      name: string;
      avatar_url: string | null;
    };
  };
};

export async function getUserSubscriptionsEnriched(
  userId: string
): Promise<EnrichedSubscription[]> {
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from('kol_subscriptions')
    .select(
      `
      id,
      kol_source_id,
      created_at,
      kol_sources!inner (
        id,
        kol_id,
        platform,
        platform_id,
        platform_url,
        monitoring_enabled,
        last_scraped_at,
        kols!inner (
          id,
          name,
          avatar_url
        )
      )
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (rows as unknown as DbEnrichedSubscription[]).map((row) => ({
    id: row.id,
    kolSourceId: row.kol_source_id,
    kolId: row.kol_sources.kol_id,
    kolName: row.kol_sources.kols.name,
    kolAvatarUrl: row.kol_sources.kols.avatar_url,
    platform: row.kol_sources.platform,
    platformId: row.kol_sources.platform_id,
    platformUrl: row.kol_sources.platform_url,
    monitoringEnabled: row.kol_sources.monitoring_enabled,
    lastScrapedAt: row.kol_sources.last_scraped_at,
    createdAt: row.created_at,
  }));
}

export async function isSubscribed(userId: string, sourceId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { count, error } = await supabase
    .from('kol_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kol_source_id', sourceId);

  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
