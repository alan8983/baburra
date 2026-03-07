// KOL Source Repository — CRUD for kol_sources table

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { KolSource } from '@/domain/models';

type DbKolSource = {
  id: string;
  kol_id: string;
  platform: string;
  platform_id: string;
  platform_url: string;
  scrape_status: string;
  last_scraped_at: string | null;
  posts_scraped_count: number;
  monitoring_enabled: boolean;
  monitor_frequency_hours: number;
  next_check_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapDbToKolSource(row: DbKolSource): KolSource {
  return {
    id: row.id,
    kolId: row.kol_id,
    platform: row.platform,
    platformId: row.platform_id,
    platformUrl: row.platform_url,
    scrapeStatus: row.scrape_status,
    lastScrapedAt: row.last_scraped_at ? new Date(row.last_scraped_at) : null,
    postsScrapedCount: row.posts_scraped_count,
    monitoringEnabled: row.monitoring_enabled,
    monitorFrequencyHours: row.monitor_frequency_hours,
    nextCheckAt: row.next_check_at ? new Date(row.next_check_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function findOrCreateSource(
  kolId: string,
  platform: string,
  platformId: string,
  platformUrl: string
): Promise<KolSource> {
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from('kol_sources')
    .upsert(
      {
        kol_id: kolId,
        platform,
        platform_id: platformId,
        platform_url: platformUrl,
      },
      { onConflict: 'platform,platform_id' }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapDbToKolSource(row as DbKolSource);
}

export async function getSourceById(sourceId: string): Promise<KolSource | null> {
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from('kol_sources')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) return null;
  return mapDbToKolSource(row as DbKolSource);
}

export async function getSourcesByKolId(kolId: string): Promise<KolSource[]> {
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from('kol_sources')
    .select('*')
    .eq('kol_id', kolId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (rows as DbKolSource[]).map(mapDbToKolSource);
}

export async function getSourcesForMonitoring(limit: number = 10): Promise<KolSource[]> {
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from('kol_sources')
    .select('*')
    .eq('monitoring_enabled', true)
    .lte('next_check_at', new Date().toISOString())
    .order('next_check_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (rows as DbKolSource[]).map(mapDbToKolSource);
}

export async function updateScrapeStatus(
  sourceId: string,
  status: string,
  postsCount?: number
): Promise<void> {
  const supabase = createAdminClient();

  const updates: Record<string, unknown> = {
    scrape_status: status,
    last_scraped_at: new Date().toISOString(),
  };

  if (postsCount !== undefined) {
    updates.posts_scraped_count = postsCount;
  }

  const { error } = await supabase.from('kol_sources').update(updates).eq('id', sourceId);

  if (error) throw new Error(error.message);
}

export async function updateNextCheckAt(sourceId: string, nextCheckAt: Date): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('kol_sources')
    .update({ next_check_at: nextCheckAt.toISOString() })
    .eq('id', sourceId);

  if (error) throw new Error(error.message);
}

export async function enableMonitoring(
  sourceId: string,
  frequencyHours: number = 24
): Promise<void> {
  const supabase = createAdminClient();
  const nextCheckAt = new Date(Date.now() + frequencyHours * 60 * 60 * 1000);

  const { error } = await supabase
    .from('kol_sources')
    .update({
      monitoring_enabled: true,
      monitor_frequency_hours: frequencyHours,
      next_check_at: nextCheckAt.toISOString(),
    })
    .eq('id', sourceId);

  if (error) throw new Error(error.message);
}

export async function disableMonitoring(sourceId: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('kol_sources')
    .update({
      monitoring_enabled: false,
      next_check_at: null,
    })
    .eq('id', sourceId);

  if (error) throw new Error(error.message);
}
