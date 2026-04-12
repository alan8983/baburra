'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, User, Users, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { formatReturnRate, getReturnRateColorClass } from '@/domain/calculators';
import { useKolWinRate } from '@/hooks/use-kols';
import { useProfile } from '@/hooks/use-profile';
import { WinRateRing } from './win-rate-ring';
import { PeriodSelector } from '@/components/shared/period-selector';
import { PerformanceMetricsPopover } from '@/components/shared/performance-metrics-popover';
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

type PriceChangeStatusType = 'pending' | 'no_data' | 'value';

type StockPost = {
  id: string;
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
}

function calcPeriodAvg(
  posts: StockPost[],
  period: 'day5' | 'day30' | 'day90' | 'day365'
): PeriodStats {
  const statusKey = `${period}Status` as const;
  const nonNeutral = posts.filter((p) => p.sentiment !== 0);
  if (!nonNeutral.length) return { avgReturn: null, allPending: false };

  const pendingCount = nonNeutral.filter((p) => p.priceChanges[statusKey] === 'pending').length;
  const allPending = pendingCount === nonNeutral.length;

  const relevant = nonNeutral.filter((p) => p.priceChanges[period] != null);
  if (!relevant.length) return { avgReturn: null, allPending };

  const returns = relevant.map((p) => {
    const change = p.priceChanges[period]!;
    return p.sentiment > 0 ? change : -change;
  });
  return {
    avgReturn: returns.reduce((a, b) => a + b, 0) / returns.length,
    allPending,
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
  const { palette } = useColorPalette();

  // Server-computed per-period stats (dynamic 1σ classifier).
  const { data: winRateStats } = useKolWinRate(kolId);
  const { data: profile } = useProfile();

  // User's per-card override, or null to fall through to the profile default.
  const [override, setOverride] = useState<WinRatePeriod | null>(null);
  const selectedPeriod: WinRatePeriod =
    override ?? profile?.defaultWinRatePeriod ?? DEFAULT_WIN_RATE_PERIOD;

  const selectedBucket = winRateStats?.[WIN_RATE_PERIOD_TO_BUCKET[selectedPeriod]] ?? null;
  const hitRateDisplay =
    selectedBucket && selectedBucket.sufficientData && selectedBucket.hitRate !== null
      ? selectedBucket.hitRate * 100
      : null;
  const winCount = selectedBucket?.winCount ?? 0;
  const totalCalls = selectedBucket ? selectedBucket.winCount + selectedBucket.loseCount : 0;
  const noiseCount = selectedBucket?.noiseCount ?? 0;
  const thresholdRef = selectedBucket?.threshold ?? null;
  const showInsufficient = selectedBucket !== null && !selectedBucket.sufficientData;

  // Period stats
  const periodStats = useMemo(
    () => ({
      day5: calcPeriodAvg(stockPosts, 'day5'),
      day30: calcPeriodAvg(stockPosts, 'day30'),
      day90: calcPeriodAvg(stockPosts, 'day90'),
      day365: calcPeriodAvg(stockPosts, 'day365'),
    }),
    [stockPosts]
  );

  // Sector breakdown removed: per-stock win-rate aggregation belongs in a follow-up
  // change that adds a per-ticker bucket to the win-rate API. Inline classification
  // is no longer permitted (see openspec/changes/dynamic-volatility-threshold).

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
            {/* Hit Rate Ring + period selector + metrics popover */}
            <div className="flex flex-col items-center gap-2">
              <PeriodSelector value={selectedPeriod} onChange={setOverride} />
              <div className="flex items-center gap-1">
                <WinRateRing
                  value={hitRateDisplay}
                  label={t('detail.scorecard.hitRate')}
                  size={120}
                />
                <PerformanceMetricsPopover bucket={selectedBucket} />
              </div>
              {totalCalls > 0 && (
                <p className="text-muted-foreground text-xs">
                  {winCount}/{totalCalls} {t('detail.scorecard.correct')}
                  {noiseCount > 0 && ` · ${noiseCount} noise`}
                </p>
              )}
              {showInsufficient && <InsufficientDataBadge />}
              {thresholdRef && (
                <p className="text-muted-foreground text-[10px]">
                  ±{(thresholdRef.value * 100).toFixed(1)}% σ
                  {thresholdRef.source === 'index-fallback' && ' (index)'}
                </p>
              )}
              {hasInferredTickers && totalCalls > 0 && (
                <p className="text-muted-foreground max-w-[140px] text-center text-[10px] leading-tight">
                  此勝率包含系統推論的關聯標的
                </p>
              )}
            </div>

            {/* Return Rates + Sector (gated for free users) */}
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
                    </div>
                  ))}
                </div>
              </div>
            </BlurGate>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
