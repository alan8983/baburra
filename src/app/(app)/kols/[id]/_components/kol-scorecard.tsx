'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, User, Users, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import {
  formatReturnRate,
  getReturnRateColorClass,
  type WinRateBucket,
} from '@/domain/calculators';
import { useKolWinRate } from '@/hooks/use-kols';
import { useProfile } from '@/hooks/use-profile';
import { WinRateRing } from './win-rate-ring';
import { PeriodSelector } from '@/components/shared/period-selector';
import { ScorecardAdvancedMetrics } from '@/components/shared/scorecard-advanced-metrics';
import { SigmaBandHistogram } from '@/components/shared/sigma-band-histogram';
import { InsufficientDataBadge } from '@/components/shared/insufficient-data-badge';
import { SubscriptionToggle } from '@/components/kol/subscription-toggle';
import { BlurGate } from '@/components/paywall/blur-gate';
import {
  DEFAULT_WIN_RATE_PERIOD,
  WIN_RATE_PERIOD_TO_BUCKET,
  type WinRatePeriod,
} from '@/domain/models/user';
import type { KOLWithStats } from '@/domain/models/kol';
import type { Sentiment } from '@/domain/models/post';
import { computeBinomialPValueAgainstHalf } from '@/lib/stats/binomial';

const MIN_DIRECTIONAL_SAMPLE_FOR_BADGES = 30;

type PriceChangeStatusType = 'pending' | 'no_data' | 'value';

type StockPost = {
  id: string;
  stockId?: string;
  stockTicker: string;
  stockName: string;
  sentiment: Sentiment;
  priceChanges: {
    day5: number | null;
    day30: number | null;
    day90: number | null;
    day365: number | null;
    day5Status: PriceChangeStatusType;
    day30Status: PriceChangeStatusType;
    day90Status: PriceChangeStatusType;
    day365Status: PriceChangeStatusType;
  };
};

interface KolScorecardProps {
  kol: KOLWithStats;
  followerCount?: number;
  sources?: { id: string; isSubscribed: boolean }[];
  kolId: string;
  stockPosts: StockPost[];
  hasInferredTickers?: boolean;
}

interface PeriodStats {
  avgReturn: number | null;
  allPending: boolean;
  pendingCount: number;
}

/**
 * Derive per-period display stats from the server-aggregated bucket. The
 * previous implementation re-averaged on the client over a 20-post window
 * and silently dropped posts whose candles timed out — scorecards drifted
 * across devices. The bucket is computed once, server-side, from the full
 * sample set. `allPending` is true only when every sample for the period
 * is pending (no resolved returns yet).
 */
function bucketToPeriodStats(bucket: WinRateBucket | null | undefined): PeriodStats {
  if (!bucket) return { avgReturn: null, allPending: false, pendingCount: 0 };
  const resolved = bucket.returnSampleSize;
  const pending = bucket.pendingCount;
  return {
    avgReturn: bucket.avgReturn,
    allPending: resolved === 0 && pending > 0,
    pendingCount: pending,
  };
}

export function KolScorecard({
  kol,
  followerCount,
  sources,
  kolId,
  stockPosts,
  hasInferredTickers,
}: KolScorecardProps) {
  const t = useTranslations('kols');
  const tMetrics = useTranslations('common.metrics');
  const { palette } = useColorPalette();

  // Loading taxonomy:
  //   data === undefined  → React Query has not resolved yet (initial fetch in flight).
  //   data === null       → server returned `{ status: 'computing' }`; we're polling.
  //   data === stats      → cache hit (or legacy synchronous compute), render normally.
  // Both undefined/null cases should show the "正在計算..." text — the previous
  // gate (`null && winRateFetching`) flickered to false in the 3 s gap between
  // polls, leaving the ring blank with no other UI to explain why.
  const { data: winRateStats, isFetching: winRateFetching } = useKolWinRate(kolId);
  const isComputing = winRateStats === null || (winRateStats === undefined && winRateFetching);
  const { data: profile } = useProfile();

  // User's per-card override, or null to fall through to the profile default.
  const [override, setOverride] = useState<WinRatePeriod | null>(null);
  const selectedPeriod: WinRatePeriod =
    override ?? profile?.defaultWinRatePeriod ?? DEFAULT_WIN_RATE_PERIOD;

  const selectedBucket = winRateStats?.[WIN_RATE_PERIOD_TO_BUCKET[selectedPeriod]] ?? null;
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
  const thresholdRef = selectedBucket?.threshold ?? null;
  const showInsufficient =
    selectedBucket !== null && directionalSampleSize < MIN_DIRECTIONAL_SAMPLE_FOR_BADGES;
  const showSignificantBadge =
    !showInsufficient &&
    directionalDisplay !== null &&
    computeBinomialPValueAgainstHalf(directionalCorrectCount, directionalSampleSize) < 0.05;

  // Period stats — now read straight from the server-aggregated blob.
  const periodStats = useMemo(
    () => ({
      day5: bucketToPeriodStats(winRateStats?.day5),
      day30: bucketToPeriodStats(winRateStats?.day30),
      day90: bucketToPeriodStats(winRateStats?.day90),
      day365: bucketToPeriodStats(winRateStats?.day365),
    }),
    [winRateStats]
  );

  // Per-stock breakdown — derived from the `bucketsByStock` returned by the
  // persistent win-rate pipeline. Shown only for the currently-selected period
  // and only once there is data for at least one stock.
  const selectedBucketKey = WIN_RATE_PERIOD_TO_BUCKET[selectedPeriod];
  const stockIdLookup = useMemo(() => {
    const map: Record<string, { ticker: string; name: string }> = {};
    for (const p of stockPosts) {
      if (p.stockId && !map[p.stockId]) {
        map[p.stockId] = { ticker: p.stockTicker, name: p.stockName };
      }
    }
    return map;
  }, [stockPosts]);
  const bucketsByStock = winRateStats?.bucketsByStock ?? null;
  const perStockRows = bucketsByStock
    ? Object.entries(bucketsByStock)
        .map(([stockId, stats]) => ({
          stockId,
          bucket: stats[selectedBucketKey],
          ticker: stockIdLookup[stockId]?.ticker ?? stockId.slice(0, 8),
        }))
        .filter((row) => row.bucket.total > 0)
        .sort((a, b) => (b.bucket.hitRate ?? -1) - (a.bucket.hitRate ?? -1))
        .slice(0, 8)
    : [];

  const periods = [
    { key: 'day5' as const, label: t('detail.returnRate.periods.5d'), data: periodStats.day5 },
    { key: 'day30' as const, label: t('detail.returnRate.periods.30d'), data: periodStats.day30 },
    { key: 'day90' as const, label: t('detail.returnRate.periods.90d'), data: periodStats.day90 },
    {
      key: 'day365' as const,
      label: t('detail.returnRate.periods.365d'),
      data: periodStats.day365,
    },
  ];

  return (
    <Card className="animate-fade-up">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Left: Avatar + Identity */}
          <div className="flex flex-col items-center gap-3 lg:items-start">
            <Avatar className="h-20 w-20">
              <AvatarImage src={kol.avatarUrl || undefined} />
              <AvatarFallback>
                <User className="h-10 w-10" />
              </AvatarFallback>
            </Avatar>
            <div className="text-center lg:text-left">
              <h1 className="text-2xl font-bold">{kol.name}</h1>
              {kol.bio && <p className="text-muted-foreground mt-1 max-w-xs text-sm">{kol.bio}</p>}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                <Badge variant="outline">
                  {t('detail.stats.postCount')} {kol.postCount}
                </Badge>
                {followerCount != null && followerCount > 0 && (
                  <Badge variant="secondary">
                    <Users className="mr-1 h-3 w-3" />
                    {t('detail.stats.followers', { count: followerCount })}
                  </Badge>
                )}
              </div>
              {/* Social links */}
              {Object.entries(kol.socialLinks).length > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                  {Object.entries(kol.socialLinks).map(([platform, url]) => (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {platform}
                    </a>
                  ))}
                </div>
              )}
              {/* Subscriptions */}
              {sources && sources.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                  {sources.map((source) => (
                    <SubscriptionToggle
                      key={source.id}
                      kolId={kolId}
                      sourceId={source.id}
                      isSubscribed={source.isSubscribed}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Scorecard metrics */}
          <div className="flex flex-1 flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-end">
            {/* Directional Hit Rate Ring + Histogram + Advanced metrics */}
            <div className="flex flex-col items-center gap-3">
              <PeriodSelector value={selectedPeriod} onChange={setOverride} />
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-col items-center gap-1">
                  <WinRateRing
                    value={directionalDisplay}
                    mode="centred-gauge"
                    label={t('detail.scorecard.directionalHitRate')}
                    size={120}
                  />
                  {isComputing && (
                    <p className="text-muted-foreground animate-pulse text-xs">
                      {t('detail.scorecard.computing')}
                    </p>
                  )}
                  {!isComputing && directionalSampleSize > 0 && (
                    <p className="text-muted-foreground text-xs">
                      {directionalCorrectCount}/{directionalSampleSize}{' '}
                      {t('detail.scorecard.correct')}
                    </p>
                  )}
                  {!isComputing && showInsufficient && <InsufficientDataBadge />}
                  {!isComputing && showSignificantBadge && (
                    <Badge variant="secondary" className="text-[10px]">
                      {tMetrics('statisticallySignificantBadge')}
                    </Badge>
                  )}
                  {thresholdRef && (
                    <p className="text-muted-foreground text-[10px]">
                      ±{(thresholdRef.value * 100).toFixed(1)}% σ
                      {thresholdRef.source === 'index-fallback' && ' (idx)'}
                    </p>
                  )}
                  {hasInferredTickers && directionalSampleSize > 0 && (
                    <p className="text-muted-foreground max-w-[140px] text-center text-[10px] leading-tight">
                      此命中率包含系統推論的關聯標的
                    </p>
                  )}
                </div>
                {!isComputing && directionalSampleSize > 0 && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-muted-foreground text-[10px]">
                      {tMetrics('histogramTitle')}
                    </span>
                    <SigmaBandHistogram bins={histogram} />
                  </div>
                )}
              </div>
              {!isComputing && selectedBucket && (
                <ScorecardAdvancedMetrics bucket={selectedBucket} className="w-full max-w-xs" />
              )}
            </div>

            {/* Return Rates + per-stock breakdown (gated for free users) */}
            <BlurGate feature="win_rate_breakdown">
              <div className="flex flex-col gap-3">
                {/* 4-period returns */}
                <div className="grid grid-cols-4 gap-2">
                  {periods.map((item) => (
                    <div key={item.key} className="min-w-[60px] rounded-lg border p-2 text-center">
                      <p className="text-muted-foreground text-xs font-medium">{item.label}</p>
                      {item.data.allPending ? (
                        <p className="text-muted-foreground mt-1 text-sm">
                          <Clock className="inline h-3.5 w-3.5" />
                        </p>
                      ) : (
                        <p
                          className={`mt-1 text-sm font-bold ${getReturnRateColorClass(item.data.avgReturn, palette)}`}
                        >
                          {formatReturnRate(item.data.avgReturn)}
                        </p>
                      )}
                      {item.data.pendingCount > 0 && !item.data.allPending && (
                        <p className="text-muted-foreground mt-0.5 text-[10px] leading-tight">
                          {t('detail.scorecard.pending', { count: item.data.pendingCount })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Per-stock hit-rate breakdown for the selected period */}
                {perStockRows.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {perStockRows.map(({ stockId, ticker, bucket }) => {
                      const pct =
                        bucket.sufficientData && bucket.hitRate !== null
                          ? Math.round(bucket.hitRate * 100)
                          : null;
                      return (
                        <span
                          key={stockId}
                          className="bg-muted/60 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]"
                          title={`${ticker}: ${bucket.winCount}W/${bucket.loseCount}L/${bucket.noiseCount}N`}
                        >
                          <span className="font-mono">{ticker}</span>
                          <span
                            className={
                              pct === null
                                ? 'text-muted-foreground'
                                : pct >= 50
                                  ? 'text-emerald-500 dark:text-emerald-400'
                                  : 'text-red-500 dark:text-red-400'
                            }
                          >
                            {pct === null ? '—' : `${pct}%`}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </BlurGate>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
