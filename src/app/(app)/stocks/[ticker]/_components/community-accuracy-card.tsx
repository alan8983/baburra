'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { WinRateRing } from '@/app/(app)/kols/[id]/_components/win-rate-ring';
import { PeriodSelector } from '@/components/shared/period-selector';
import { PerformanceMetricsPopover } from '@/components/shared/performance-metrics-popover';
import { InsufficientDataBadge } from '@/components/shared/insufficient-data-badge';
import { useStockWinRate } from '@/hooks/use-stocks';
import { useProfile } from '@/hooks/use-profile';
import {
  DEFAULT_WIN_RATE_PERIOD,
  WIN_RATE_PERIOD_TO_BUCKET,
  type WinRatePeriod,
} from '@/domain/models/user';

interface CommunityAccuracyCardProps {
  ticker: string;
}

/**
 * Aggregate "how accurate is the KOL community on this ticker" card for the
 * stock detail page. Mirrors the KOL scorecard layout: ring + period selector
 * + metrics popover + insufficient-data handling.
 */
export function CommunityAccuracyCard({ ticker }: CommunityAccuracyCardProps) {
  const t = useTranslations('stocks');
  const { data: stats, isLoading } = useStockWinRate(ticker);
  const { data: profile } = useProfile();

  const [override, setOverride] = useState<WinRatePeriod | null>(null);
  const selectedPeriod: WinRatePeriod =
    override ?? profile?.defaultWinRatePeriod ?? DEFAULT_WIN_RATE_PERIOD;

  const selectedBucket = stats?.[WIN_RATE_PERIOD_TO_BUCKET[selectedPeriod]] ?? null;
  const hitRateDisplay =
    selectedBucket && selectedBucket.sufficientData && selectedBucket.hitRate !== null
      ? selectedBucket.hitRate * 100
      : null;
  const winCount = selectedBucket?.winCount ?? 0;
  const totalCalls = selectedBucket ? selectedBucket.winCount + selectedBucket.loseCount : 0;
  const noiseCount = selectedBucket?.noiseCount ?? 0;
  const showInsufficient = selectedBucket !== null && !selectedBucket.sufficientData;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>{t('detail.communityAccuracy.title', { ticker })}</CardTitle>
            <CardDescription>{t('detail.communityAccuracy.description')}</CardDescription>
          </div>
          <PeriodSelector value={selectedPeriod} onChange={setOverride} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : !selectedBucket || selectedBucket.total === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {t('detail.communityAccuracy.noData')}
          </p>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1">
              <WinRateRing
                value={hitRateDisplay}
                label={t('detail.communityAccuracy.hitRateLabel')}
                size={120}
              />
              <PerformanceMetricsPopover bucket={selectedBucket} />
            </div>
            {totalCalls > 0 && (
              <p className="text-muted-foreground text-xs">
                {winCount}/{totalCalls} {t('detail.communityAccuracy.correct')}
                {noiseCount > 0 && ` · ${noiseCount} noise`}
              </p>
            )}
            {showInsufficient && <InsufficientDataBadge />}
            {selectedBucket.threshold && (
              <p className="text-muted-foreground text-[10px]">
                ±{(selectedBucket.threshold.value * 100).toFixed(1)}% σ
                {selectedBucket.threshold.source === 'index-fallback' && ' (index)'}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
