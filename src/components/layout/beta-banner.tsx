'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BILLING_MODE, BETA_CREDIT_LIMIT } from '@/lib/constants/billing';

const DISMISSED_KEY = 'beta-banner-dismissed';

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return true;
  return sessionStorage.getItem(DISMISSED_KEY) === 'true';
}

function getServerSnapshot(): boolean {
  return true; // SSR: assume dismissed (don't render)
}

function subscribe(callback: () => void): () => void {
  // sessionStorage doesn't fire events in the same tab, so we only need the initial read
  // Re-render is triggered by the dismiss handler calling the store update
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export function BetaBanner() {
  const t = useTranslations('common');
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const handleDismiss = useCallback(() => {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    // Force a re-render by dispatching a storage event won't work in same tab,
    // so we use a simple approach: reload the component state
    window.dispatchEvent(new Event('storage'));
  }, []);

  if (BILLING_MODE !== 'beta' || dismissed) return null;

  return (
    <div className="bg-primary text-primary-foreground relative flex items-center justify-center gap-2 px-4 py-2 text-sm">
      <span>{t('betaBanner.message', { credits: BETA_CREDIT_LIMIT.toLocaleString() })}</span>
      <a
        href="https://github.com/alan8983/investment-idea-monitor/issues"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
      >
        {t('betaBanner.feedback')}
      </a>
      <button
        onClick={handleDismiss}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 hover:opacity-80"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
