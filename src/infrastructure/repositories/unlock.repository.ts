/**
 * Unlock Repository — persistent per-user L2/L3 content unlocks.
 * Backed by the `content_unlocks` table (migration 031).
 */

import { createAdminClient } from '@/infrastructure/supabase/admin';

export type UnlockType = 'kol_ticker' | 'stock_page';

export interface ContentUnlock {
  id: string;
  userId: string;
  unlockType: UnlockType;
  targetKey: string;
  creditsPaid: number;
  unlockedAt: Date;
}

type Row = {
  id: string;
  user_id: string;
  unlock_type: string;
  target_key: string;
  credits_paid: number;
  unlocked_at: string;
};

function mapRow(row: Row): ContentUnlock {
  return {
    id: row.id,
    userId: row.user_id,
    unlockType: row.unlock_type as UnlockType,
    targetKey: row.target_key,
    creditsPaid: row.credits_paid,
    unlockedAt: new Date(row.unlocked_at),
  };
}

export function kolTickerKey(kolId: string, stockId: string): string {
  return `${kolId}:${stockId}`;
}

export function stockPageKey(stockId: string): string {
  return stockId;
}

export async function listUnlocks(userId: string): Promise<ContentUnlock[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('content_unlocks')
    .select('*')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list unlocks: ${error.message}`);
  }

  return (data as Row[]).map(mapRow);
}

export async function findUnlock(
  userId: string,
  unlockType: UnlockType,
  targetKey: string
): Promise<ContentUnlock | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('content_unlocks')
    .select('*')
    .eq('user_id', userId)
    .eq('unlock_type', unlockType)
    .eq('target_key', targetKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find unlock: ${error.message}`);
  }
  return data ? mapRow(data as Row) : null;
}

export async function insertUnlock(
  userId: string,
  unlockType: UnlockType,
  targetKey: string,
  creditsPaid: number
): Promise<ContentUnlock> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  const { data, error } = await supabase
    .from('content_unlocks')
    .insert({
      user_id: userId,
      unlock_type: unlockType,
      target_key: targetKey,
      credits_paid: creditsPaid,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to insert unlock: ${error.message}`);
  }
  return mapRow(data as Row);
}

/**
 * Count L2 unlocks used this calendar month for a user.
 * Used to enforce Free-tier monthly quota.
 */
export async function countL2UnlocksThisMonth(userId: string): Promise<number> {
  const supabase = createAdminClient();
  if (!supabase) return 0;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('content_unlocks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('unlock_type', 'kol_ticker')
    .gte('unlocked_at', monthStart.toISOString());

  if (error) {
    throw new Error(`Failed to count monthly L2 unlocks: ${error.message}`);
  }
  return count ?? 0;
}
