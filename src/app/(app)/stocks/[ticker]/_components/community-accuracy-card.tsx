'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WinRateRing } from '@/app/(app)/kols/[id]/_components/win-rate-ring';
import { PeriodSelector } from '@/components/shared/period-selector';
import { ScorecardAdvancedMetrics } from '@/components/shared/scorecard-advanced-metrics';
import { SigmaBandHistogram } from '@/components/shared/sigma-band-histogram';
import { InsufficientDataBadge } from '@/components/shared/insufficient-data-badge';
import { useStockScorecard } from '@/hooks/use-stocks';
import { useProfile } from '@/hooks/use-profile';
import { computeBinomialPValueAgainstHalf } from '@/lib/stats/binomial';
import {
  DEFAULT_WIN_RATE_PERIOD,
  WIN_RATE_PERIOD_TO_BUCKET,
  type WinRatePeriod,
} from '@/domain/models/user';

const MIN_DIRECTIONAL_SAMPLE_FOR_BADGES = 30;

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
  const tMetrics = useTranslations('common.metrics');
  const { data: stats, isLoading, isFetching } = useStockScorecard(ticker);
  const { data: profile } = useProfile();

  const [override, setOverride] = useState<WinRatePeriod | null>(null);
  const selectedPeriod: WinRatePeriod =
    override ?? profile?.defaultWinRatePeriod ?? DEFAULT_WIN_RATE_PERIOD;

  const selectedBucket = stats?.[WIN_RATE_PERIOD_TO_BUCKET[selectedPeriod]] ?? null;
  const directionalDisplay =
    selectedBucket && selectedBucket.directionalHitRate !== null
      ? selectedBucket.directionalHitRate * 100
      : null;
  const directionalSampleSize = selectedBucket?.directionalSampleSize ?? 0;
  const directionalCorrectCount =
    directionalDisplay !== null && directionalSampleSize > 0
      ? Math.round((directionalDisplay / 100) * directionalSampleSize)
      : 0;
  const histogram = selectedBucket?.histogram ?? ([0, 0, 0, 0, 0, 0] as const);
  const showInsufficient =
    selectedBucket !== null && directionalSampleSize < MIN_DIRECTIONAL_SAMPLE_FOR_BADGES;
  const showSignificantBadge =
    !showInsufficient &&
    directionalDisplay !== null &&
    computeBinomialPValueAgainstHalf(directionalCorrectCount, directionalSampleSize) < 0.05;

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
        {isLoading || (stats === null && isFetching) || stats === null ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : !selectedBucket || selectedBucket.total === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {t('detail.communityAccuracy.noData')}
          </p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-col items-center gap-1">
                <WinRateRing
                  value={directionalDisplay}
                  mode="centred-gauge"
                  label={t('detail.communityAccuracy.directionalHitRateLabel')}
                  size={120}
                />
                {directionalSampleSize > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {directionalCorrectCount}/{directionalSampleSize}{' '}
                    {t('detail.communityAccuracy.correct')}
                  </p>
                )}
                {showInsufficient && <InsufficientDataBadge />}
                {showSignificantBadge && (
                  <Badge variant="secondary" className="text-[10px]">
                    {tMetrics('statisticallySignificantBadge')}
                  </Badge>
                )}
                {selectedBucket.threshold && (
                  <p className="text-muted-foreground text-[10px]">
                    ±{(selectedBucket.threshold.value * 100).toFixed(1)}% σ
                    {selectedBucket.threshold.source === 'index-fallback' && ' (idx)'}
                  </p>
                )}
              </div>
              {directionalSampleSize > 0 && (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-muted-foreground text-[10px]">
                    {tMetrics('histogramTitle')}
                  </span>
                  <SigmaBandHistogram bins={histogram} />
                </div>
              )}
            </div>
            <ScorecardAdvancedMetrics bucket={selectedBucket} className="w-full max-w-xs" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
