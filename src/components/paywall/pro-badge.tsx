'use client';

import { LockKeyhole } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { useUpgradePrompt } from '@/components/paywall/upgrade-prompt';
import type { Feature } from '@/domain/services/feature-gate.service';

interface ProBadgeProps {
  feature: Feature;
}

export function ProBadge({ feature }: ProBadgeProps) {
  const { canAccess } = useFeatureGate(feature);
  const t = useTranslations('paywall');

  if (canAccess) return null;

  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
      <LockKeyhole className="size-2.5" />
      {t('proBadge')}
    </span>
  );
}

interface ProBadgeGateProps {
  feature: Feature;
  children: React.ReactNode;
  onClick?: () => void;
}

export function ProBadgeGate({ feature, children, onClick }: ProBadgeGateProps) {
  const { canAccess, requiredTier } = useFeatureGate(feature);
  const { openUpgrade } = useUpgradePrompt();

  const handleClick = (e: React.MouseEvent) => {
    if (!canAccess) {
      e.preventDefault();
      e.stopPropagation();
      openUpgrade(requiredTier);
      return;
    }
    onClick?.();
  };

  return (
    <div onClick={handleClick} className="cursor-pointer">
      {children}
    </div>
  );
}
