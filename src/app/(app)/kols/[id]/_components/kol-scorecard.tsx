'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ExternalLink, User, Users, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { formatReturnRate, getReturnRateColorClass } from '@/domain/calculators';
import { WinRateRing } from './win-rate-ring';
import { SubscriptionToggle } from '@/components/kol/subscription-toggle';
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
}: KolScorecardProps) {
  const t = useTranslations('kols');
  const { palette, colors } = useColorPalette();

  // Calculate overall win rate from all stock posts
  const { winRate, winCount, totalCalls } = useMemo(() => {
    const nonNeutral = stockPosts.filter((p) => p.sentiment !== 0 && p.priceChanges.day30 != null);
    const wins = nonNeutral.filter((p) => {
      const change = p.priceChanges.day30!;
      return p.sentiment > 0 ? change > 0 : change < 0;
    }).length;
    return {
      winRate: nonNeutral.length > 0 ? (wins / nonNeutral.length) * 100 : null,
      winCount: wins,
      totalCalls: nonNeutral.length,
    };
  }, [stockPosts]);

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

  // Sector breakdown (group by stock ticker)
  const sectorBreakdown = useMemo(() => {
    const map = new Map<string, { ticker: string; wins: number; total: number }>();
    for (const post of stockPosts) {
      if (post.sentiment === 0 || post.priceChanges.day30 == null) continue;
      if (!map.has(post.stockTicker)) {
        map.set(post.stockTicker, { ticker: post.stockTicker, wins: 0, total: 0 });
      }
      const entry = map.get(post.stockTicker)!;
      entry.total++;
      const change = post.priceChanges.day30!;
      if ((post.sentiment > 0 && change > 0) || (post.sentiment < 0 && change < 0)) {
        entry.wins++;
      }
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, winRate: (e.wins / e.total) * 100 }))
      .sort((a, b) => b.winRate - a.winRate);
  }, [stockPosts]);

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
            {/* Win Rate Ring */}
            <div className="flex flex-col items-center">
              <WinRateRing value={winRate} label={t('detail.scorecard.winRate')} size={120} />
              {totalCalls > 0 && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {winCount}/{totalCalls} {t('detail.scorecard.correct')}
                </p>
              )}
            </div>

            {/* Return Rates + Sector */}
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

              {/* Sector breakdown */}
              {sectorBreakdown.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground mb-2 text-xs font-medium">
                    {t('detail.scorecard.sectorPerformance')}
                  </p>
                  <div className="space-y-1.5">
                    {sectorBreakdown.slice(0, 5).map((sector) => (
                      <div
                        key={sector.ticker}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="font-medium">{sector.ticker}</span>
                        <div className="flex items-center gap-2">
                          {/* Mini bar */}
                          <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
                            <div
                              className={`h-full rounded-full ${
                                sector.winRate >= 50 ? 'bg-emerald-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(sector.winRate, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`min-w-[36px] text-right font-bold ${
                              sector.winRate >= 50 ? colors.bullish.text : colors.bearish.text
                            }`}
                          >
                            {sector.winRate.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
