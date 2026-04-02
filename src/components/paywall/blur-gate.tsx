'use client';

import React from 'react';
import { LockKeyhole } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { Button } from '@/components/ui/button';
import { useUpgradePrompt } from '@/components/paywall/upgrade-prompt';
import { BILLING_MODE } from '@/lib/constants/billing';
import type { Feature } from '@/domain/services/feature-gate.service';

interface BlurGateProps {
  feature: Feature;
  children: React.ReactNode;
}

export function BlurGate({ feature, children }: BlurGateProps) {
  const { canAccess, isBlurred, previewLimit, requiredTier } = useFeatureGate(feature);
  const t = useTranslations('paywall');
  const { openUpgrade } = useUpgradePrompt();

  // Beta mode: render children without blur
  if (BILLING_MODE === 'beta') {
    return <>{children}</>;
  }

  if (canAccess || !isBlurred) {
    return <>{children}</>;
  }

  const childArray = React.Children.toArray(children);
  const visibleChildren = childArray.slice(0, previewLimit ?? 2);
  const blurredChildren = childArray.slice(previewLimit ?? 2);

  if (blurredChildren.length === 0) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {visibleChildren}
      <div className="relative">
        <div className="pointer-events-none select-none" style={{ filter: 'blur(4px)' }}>
          {blurredChildren}
        </div>
        <div className="to-background absolute inset-0 bg-gradient-to-b from-transparent" />
      </div>
      <div className="relative z-10 -mt-4 flex justify-center">
        <div className="bg-card max-w-sm rounded-lg border p-6 text-center shadow-sm">
          <LockKeyhole className="text-muted-foreground mx-auto mb-2 size-6" />
          <p className="mb-1 text-sm font-medium">{t('blur.title')}</p>
          <p className="text-muted-foreground mb-4 text-xs">{t('blur.description')}</p>
          <Button size="sm" onClick={() => openUpgrade(requiredTier)}>
            {t('blur.cta')}
          </Button>
        </div>
      </div>
    </div>
  );
}
