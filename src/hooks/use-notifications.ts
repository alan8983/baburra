'use client';

import { useCallback, useSyncExternalStore } from 'react';

export interface ScrapeNotification {
  id: string;
  kolName: string;
  imported: number;
  kolId: string;
  timestamp: number;
}

const SCRAPE_PREFIX = 'scrape_completed_';
const POLL_INTERVAL_MS = 10_000;

function readNotifications(): ScrapeNotification[] {
  if (typeof window === 'undefined') return [];

  const notifications: ScrapeNotification[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(SCRAPE_PREFIX)) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const data = JSON.parse(raw);
      const jobId = key.slice(SCRAPE_PREFIX.length);
      notifications.push({
        id: jobId,
        kolName: data.kolName ?? 'KOL',
        imported: data.imported ?? 0,
        kolId: data.kolId ?? '',
        timestamp: data.ts ?? 0,
      });
    }
  } catch {
    // localStorage unavailable
  }

  return notifications.sort((a, b) => b.timestamp - a.timestamp);
}

// Snapshot for useSyncExternalStore — re-reads localStorage on subscribe tick
let cachedSnapshot: ScrapeNotification[] = [];

function getSnapshot(): ScrapeNotification[] {
  return cachedSnapshot;
}

function getServerSnapshot(): ScrapeNotification[] {
  return [];
}

function subscribe(onStoreChange: () => void): () => void {
  // Initial read
  cachedSnapshot = readNotifications();
  onStoreChange();

  // Poll every POLL_INTERVAL_MS
  const interval = setInterval(() => {
    const next = readNotifications();
    // Only trigger re-render if data actually changed
    if (JSON.stringify(next) !== JSON.stringify(cachedSnapshot)) {
      cachedSnapshot = next;
      onStoreChange();
    }
  }, POLL_INTERVAL_MS);

  return () => clearInterval(interval);
}

export function useNotifications() {
  const notifications = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const dismiss = useCallback((id: string) => {
    try {
      localStorage.removeItem(`${SCRAPE_PREFIX}${id}`);
    } catch {
      // ignore
    }
    cachedSnapshot = cachedSnapshot.filter((n) => n.id !== id);
  }, []);

  const dismissAll = useCallback(() => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(SCRAPE_PREFIX)) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
    cachedSnapshot = [];
  }, []);

  return {
    notifications,
    unreadCount: notifications.length,
    dismiss,
    dismissAll,
  };
}
