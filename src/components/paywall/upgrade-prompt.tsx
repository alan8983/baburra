'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUserTier } from '@/hooks/use-feature-gate';
import { CheckCircle2 } from 'lucide-react';

type UpgradeTier = 'pro' | 'max';

interface UpgradePromptContextValue {
  openUpgrade: (tier: UpgradeTier) => void;
}

const UpgradePromptContext = createContext<UpgradePromptContextValue>({
  openUpgrade: () => {},
});

export function useUpgradePrompt() {
  return useContext(UpgradePromptContext);
}

const FEATURE_KEYS = [
  'argumentCards',
  'winRateBreakdown',
  'kolComparison',
  'moreTracking',
] as const;

export function UpgradePromptProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [targetTier, setTargetTier] = useState<UpgradeTier>('pro');
  const userTier = useUserTier();
  const t = useTranslations('paywall');

  const openUpgrade = useCallback((tier: UpgradeTier) => {
    setTargetTier(tier);
    setOpen(true);
  }, []);

  return (
    <UpgradePromptContext.Provider value={{ openUpgrade }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('upgrade.title')}</DialogTitle>
          </DialogHeader>

          <p className="text-muted-foreground text-sm">
            {t('upgrade.currentTier', { tier: t(`tierNames.${userTier}`) })}
          </p>

          <ul className="space-y-2 py-2">
            {FEATURE_KEYS.map((key) => (
              <li key={key} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                {t(`upgrade.features.${key}`)}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={() => setOpen(false)}>
              {t('upgrade.cta', { tier: t(`tierNames.${targetTier}`) })}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t('upgrade.dismiss')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </UpgradePromptContext.Provider>
  );
}
