'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'baburra:seen-posts';
const MAX_STORED_IDS = 500;

// Module-level cache so all subscribers share the same snapshot
let cachedIds: Set<string> | null = null;
let listeners: Array<() => void> = [];

function notifyListeners() {
  for (const fn of listeners) fn();
}

function getSnapshot(): Set<string> {
  if (cachedIds === null) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      cachedIds = raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      cachedIds = new Set();
    }
  }
  return cachedIds;
}

const emptySet = new Set<string>();
function getServerSnapshot(): Set<string> {
  return emptySet;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.push(onStoreChange);
  return () => {
    listeners = listeners.filter((fn) => fn !== onStoreChange);
  };
}

function addSeenId(postId: string) {
  const current = getSnapshot();
  if (current.has(postId)) return;
  const next = new Set(current);
  next.add(postId);
  // Persist with cap
  try {
    const arr = Array.from(next);
    const trimmed = arr.length > MAX_STORED_IDS ? arr.slice(arr.length - MAX_STORED_IDS) : arr;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Silently ignore storage errors
  }
  cachedIds = next;
  notifyListeners();
}

export function useSeenPosts(postIds: string[]) {
  const seenIds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isNew = useCallback((postId: string): boolean => !seenIds.has(postId), [seenIds]);

  const markSeen = useCallback((postId: string) => {
    addSeenId(postId);
  }, []);

  const newCount = useMemo(
    () => postIds.filter((id) => !seenIds.has(id)).length,
    [postIds, seenIds]
  );

  return { isNew, markSeen, newCount };
}
