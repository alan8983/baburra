'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Trophy, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ROUTES } from '@/lib/constants';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { getStaggerClass } from '@/lib/animations';
import { PeriodSelector } from '@/components/shared/period-selector';
import { useProfile } from '@/hooks/use-profile';
import {
  DEFAULT_WIN_RATE_PERIOD,
  WIN_RATE_PERIOD_TO_BUCKET,
  type WinRatePeriod,
} from '@/domain/models/user';
import type { KolWinRateEntry } from '@/hooks/use-dashboard';
import type { WinRateBucket } from '@/domain/calculators';

interface KolLeaderboardProps {
  /** Server-computed per-KOL full per-period win-rate stats. */
  kolWinRates: KolWinRateEntry[];
}

type LeaderboardTab = 'accuracy' | 'signalQuality';

interface RankingRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  bucket: WinRateBucket;
  winCount: number;
  totalCalls: number;
  hitRate: number | null; // already × 100
  sqr: number | null;
}

function buildRankings(entries: KolWinRateEntry[], period: WinRatePeriod): RankingRow[] {
  return entries.map((k) => {
    const bucket = k.stats[WIN_RATE_PERIOD_TO_BUCKET[period]];
    return {
      id: k.id,
      name: k.name,
      avatarUrl: k.avatarUrl,
      bucket,
      winCount: bucket.winCount,
      totalCalls: bucket.winCount + bucket.loseCount,
      hitRate: bucket.hitRate !== null ? bucket.hitRate * 100 : null,
      sqr: bucket.sqr,
    };
  });
}

export function KolLeaderboard({ kolWinRates }: KolLeaderboardProps) {
  const t = useTranslations('dashboard');
  const { colors } = useColorPalette();
  const { data: profile } = useProfile();

  const [override, setOverride] = useState<WinRatePeriod | null>(null);
  const selectedPeriod: WinRatePeriod =
    override ?? profile?.defaultWinRatePeriod ?? DEFAULT_WIN_RATE_PERIOD;

  // Only include KOLs whose selected period has sufficient data. Low-sample
  // rankings are filtered out entirely (not pushed to the bottom).
  const qualified = useMemo(
    () => buildRankings(kolWinRates, selectedPeriod).filter((r) => r.bucket.sufficientData),
    [kolWinRates, selectedPeriod]
  );

  const accuracyRanking = useMemo(
    () => [...qualified].sort((a, b) => (b.hitRate ?? -1) - (a.hitRate ?? -1)).slice(0, 5),
    [qualified]
  );

  const sqrRanking = useMemo(
    () => [...qualified].sort((a, b) => (b.sqr ?? -Infinity) - (a.sqr ?? -Infinity)).slice(0, 5),
    [qualified]
  );

  const renderRows = (rows: RankingRow[], tab: LeaderboardTab) => {
    if (rows.length === 0) {
      return (
        <p className="text-muted-foreground py-6 text-center text-xs">
          {t('leaderboard.insufficientDataEmpty')}
        </p>
      );
    }
    return (
      <div className="space-y-1">
        {rows.map((kol, i) => {
          const primaryValue =
            tab === 'accuracy'
              ? kol.hitRate !== null
                ? `${kol.hitRate.toFixed(1)}%`
                : '—'
              : kol.sqr !== null
                ? kol.sqr.toFixed(2)
                : '—';
          const secondaryLabel =
            tab === 'accuracy'
              ? kol.sqr !== null
                ? `SQR ${kol.sqr.toFixed(2)}`
                : null
              : kol.hitRate !== null
                ? `${kol.hitRate.toFixed(1)}%`
                : null;
          const primaryColorBullish =
            tab === 'accuracy' ? (kol.hitRate ?? 0) >= 50 : (kol.sqr ?? 0) >= 0.5;
          return (
            <Link
              key={kol.id}
              href={ROUTES.KOL_DETAIL(kol.id)}
              className={`hover:bg-muted flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors ${getStaggerClass(i)}`}
            >
              <span className="bg-primary/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {i + 1}
              </span>
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={kol.avatarUrl || undefined} />
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{kol.name}</p>
                <p className="text-muted-foreground text-xs">
                  {kol.winCount}/{kol.totalCalls} {t('leaderboard.calls')}
                </p>
              </div>
              <div className="flex flex-col items-end">
                <span
                  className={`text-sm font-bold ${
                    primaryColorBullish ? colors.bullish.text : colors.bearish.text
                  }`}
                >
                  {primaryValue}
                </span>
                {secondaryLabel && (
                  <span className="text-muted-foreground text-[10px]">{secondaryLabel}</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Trophy className="h-4 w-4 text-yellow-500" />
          {t('leaderboard.title')}
        </CardTitle>
        <PeriodSelector value={selectedPeriod} onChange={setOverride} />
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="accuracy" className="w-full">
          <TabsList className="mb-2 grid w-full grid-cols-2">
            <TabsTrigger value="accuracy">{t('leaderboard.tabs.accuracy')}</TabsTrigger>
            <TabsTrigger value="signalQuality">{t('leaderboard.tabs.signalQuality')}</TabsTrigger>
          </TabsList>
          <TabsContent value="accuracy">{renderRows(accuracyRanking, 'accuracy')}</TabsContent>
          <TabsContent value="signalQuality">{renderRows(sqrRanking, 'signalQuality')}</TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
