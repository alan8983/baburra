'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Clock, HelpCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/utils/date';
import { type Sentiment } from '@/domain/models/post';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { sentimentKey } from '@/lib/utils/sentiment';
import { PriceChangeBadge } from '@/components/shared/price-change-badge';
import { useStockPricesForChart } from '@/hooks/use-stock-prices';
import type { LineChartMarker } from '@/components/charts';
import { useKolWinRate } from '@/hooks';
import { useUnlockChecks } from '@/hooks/use-unlocks';
import { UnlockCta } from '@/components/paywall/unlock-cta';
import { formatReturnRate, getReturnRateColorClass } from '@/domain/calculators';

const SentimentLineChart = dynamic(
  () =>
    import('@/components/charts/sentiment-line-chart').then((mod) => ({
      default: mod.SentimentLineChart,
    })),
  { ssr: false }
);

// ─── Types ────────────────────────────────────────────────────────────────────

type PriceChangeStatusType = 'pending' | 'no_data' | 'value';

export type StockPost = {
  id: string;
  content: string;
  sentiment: Sentiment;
  postedAt: Date | string;
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

export type StockGroup = {
  stockId: string;
  ticker: string;
  name: string;
  posts: StockPost[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(postedAt: Date | string): string {
  if (postedAt instanceof Date) return postedAt.toISOString().slice(0, 10);
  const s = String(postedAt);
  return s.includes('T') ? s.slice(0, 10) : s.slice(0, 10);
}

/**
 * Per-stock return/pending stats sourced from the server-aggregated bucket
 * (`bucketsByStock[stockId][dayN]`). Previous implementation re-averaged
 * on the client with silent Tiingo-timeout dropouts — replaced by the
 * persistent scorecard cache so numbers are deterministic across devices.
 */
export function bucketToStockPeriodStats(
  bucket:
    | { avgReturn: number | null; pendingCount: number; returnSampleSize: number }
    | null
    | undefined
): {
  avgReturn: number | null;
  positiveCount: number;
  negativeCount: number;
  allPending: boolean;
  pendingCount: number;
} {
  if (!bucket) {
    return {
      avgReturn: null,
      positiveCount: 0,
      negativeCount: 0,
      allPending: false,
      pendingCount: 0,
    };
  }
  const resolved = bucket.returnSampleSize;
  const pending = bucket.pendingCount;
  return {
    avgReturn: bucket.avgReturn,
    positiveCount: 0, // counts no longer surfaced by the aggregate; kept for shape
    negativeCount: 0,
    allPending: resolved === 0 && pending > 0,
    pendingCount: pending,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface KolStockSectionProps {
  stock: StockGroup;
  kolId: string;
  /** When true, render every post; hide the "Show more" button. Default false. */
  showAllPosts?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KolStockSection({ stock, kolId, showAllPosts = false }: KolStockSectionProps) {
  const t = useTranslations('kols');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { palette, colors } = useColorPalette();

  const unlockChecks = useUnlockChecks();
  const isL2Unlocked = unlockChecks.hasLayer2(kolId, stock.stockId);

  const { data: chartData, isLoading: chartLoading } = useStockPricesForChart(stock.ticker);
  // Reuse the KOL-level win-rate response (already cached by react-query) to
  // source the per-(kol, stock) bucket. `bucketsByStock[stockId].day30` is the
  // 30d ring shown next to the return-rate grid.
  const { data: kolWinRateStats } = useKolWinRate(kolId);
  const stockBuckets = kolWinRateStats?.bucketsByStock?.[stock.stockId];
  const stockWinRate30d = stockBuckets?.day30 ?? null;

  const markers: LineChartMarker[] = stock.posts.map((post) => ({
    time: toDateStr(post.postedAt),
    sentiment: post.sentiment,
    postId: post.id,
  }));

  const periodStats = useMemo(
    () => ({
      day5: bucketToStockPeriodStats(stockBuckets?.day5),
      day30: bucketToStockPeriodStats(stockBuckets?.day30),
      day90: bucketToStockPeriodStats(stockBuckets?.day90),
      day365: bucketToStockPeriodStats(stockBuckets?.day365),
    }),
    [stockBuckets]
  );

  // Slice logic: show at most 3 posts on the KOL detail page unless showAllPosts is set.
  const visiblePosts =
    showAllPosts || stock.posts.length <= 3 ? stock.posts : stock.posts.slice(0, 3);
  const showMoreButton = !showAllPosts && stock.posts.length > 3;

  // Layer-2 gate: Free users see a compact preview + UnlockCta until they unlock this
  // (kolId, stockId) pair. Pro/Max users bypass via unlockChecks.hasLayer2.
  if (!isL2Unlocked) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link
            href={ROUTES.STOCK_DETAIL(stock.ticker)}
            className="text-lg font-bold hover:underline"
          >
            {stock.ticker}
          </Link>
          <span className="text-muted-foreground">—</span>
          <span className="text-sm font-medium">{stock.name}</span>
          <Badge variant="secondary" className="ml-auto text-xs">
            {t('detail.postsByStock.total', { count: stock.posts.length })}
          </Badge>
        </div>
        <UnlockCta variant={{ kind: 'layer2', kolId, stockId: stock.stockId }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stock row header */}
      <div className="flex items-center gap-2">
        <Link
          href={ROUTES.STOCK_DETAIL(stock.ticker)}
          className="text-lg font-bold hover:underline"
        >
          {stock.ticker}
        </Link>
        <span className="text-muted-foreground">—</span>
        <span className="text-sm font-medium">{stock.name}</span>
        <Badge variant="secondary" className="ml-auto text-xs">
          {t('detail.postsByStock.total', { count: stock.posts.length })}
        </Badge>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Sentiment chart + Return rate + Win rate */}
        <div className="flex flex-col gap-4">
          {/* Sentiment Line Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('detail.sentimentChart.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {chartLoading ? (
                <div className="flex h-[200px] items-center justify-center">
                  <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
                </div>
              ) : chartData && chartData.candles.length > 0 ? (
                <SentimentLineChart
                  candles={chartData.candles}
                  sentimentMarkers={markers}
                  onMarkerClick={(postId) => router.push(ROUTES.POST_DETAIL(postId))}
                  height={200}
                  className="rounded-lg border"
                />
              ) : (
                <div className="flex h-[200px] items-center justify-center">
                  <p className="text-muted-foreground text-sm">{t('detail.errors.noPriceData')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Return Rate + Win Rate */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">{t('detail.returnRate.title')}</CardTitle>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="start">
                    <h4 className="text-sm font-medium">
                      {t('detail.returnRate.explanation.title')}
                    </h4>
                    <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                      <li>• {t('detail.returnRate.explanation.bullish')}</li>
                      <li>• {t('detail.returnRate.explanation.bearish')}</li>
                      <li>• {t('detail.returnRate.explanation.neutral')}</li>
                      <li>• {t('detail.returnRate.explanation.perStock')}</li>
                    </ul>
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 4-period row */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  {
                    key: 'day5',
                    label: t('detail.returnRate.periods.5d'),
                    data: periodStats.day5,
                  },
                  {
                    key: 'day30',
                    label: t('detail.returnRate.periods.30d'),
                    data: periodStats.day30,
                  },
                  {
                    key: 'day90',
                    label: t('detail.returnRate.periods.90d'),
                    data: periodStats.day90,
                  },
                  {
                    key: 'day365',
                    label: t('detail.returnRate.periods.365d'),
                    data: periodStats.day365,
                  },
                ].map((item) => (
                  <div key={item.key} className="rounded-lg border p-2 text-center">
                    <p className="text-muted-foreground text-xs font-medium">{item.label}</p>
                    {item.data.allPending ? (
                      <>
                        <p className="text-muted-foreground mt-1 text-lg">
                          <Clock className="inline h-4 w-4" />
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {t('detail.returnRate.pending')}
                        </p>
                      </>
                    ) : (
                      <>
                        <p
                          className={`mt-1 text-lg font-bold ${getReturnRateColorClass(item.data.avgReturn, palette)}`}
                        >
                          {formatReturnRate(item.data.avgReturn)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {item.data.positiveCount}+ / {item.data.negativeCount}-
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {/* Per-(kol, stock) 30d hit-rate summary from persisted samples */}
              {stockWinRate30d && stockWinRate30d.total > 0 && (
                <div className="bg-muted/40 mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    {t('detail.returnRate.periods.30d')} · {stockWinRate30d.winCount}W /{' '}
                    {stockWinRate30d.loseCount}L / {stockWinRate30d.noiseCount}N
                  </span>
                  <span
                    className={
                      !stockWinRate30d.sufficientData || stockWinRate30d.hitRate === null
                        ? 'text-muted-foreground font-semibold'
                        : stockWinRate30d.hitRate >= 0.5
                          ? 'font-bold text-emerald-500 dark:text-emerald-400'
                          : 'font-bold text-red-500 dark:text-red-400'
                    }
                  >
                    {stockWinRate30d.sufficientData && stockWinRate30d.hitRate !== null
                      ? `${Math.round(stockWinRate30d.hitRate * 100)}%`
                      : '—'}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Posts list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('detail.postsByStock.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {visiblePosts.map((post) => (
              <div
                key={post.id}
                className="hover:bg-muted/50 cursor-pointer rounded-lg border p-3 transition-colors"
                onClick={() => router.push(ROUTES.POST_DETAIL(post.id))}
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-xs ${colors.sentimentBadgeColors[post.sentiment]}`}
                  >
                    {tCommon(`sentiment.${sentimentKey(post.sentiment)}`)}
                  </Badge>
                  <span className="text-muted-foreground text-xs">{formatDate(post.postedAt)}</span>
                </div>
                <p className="text-muted-foreground mt-1.5 line-clamp-2 text-xs">{post.content}</p>
                <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                  <PriceChangeBadge
                    value={post.priceChanges.day5}
                    status={post.priceChanges.day5Status}
                    label="5d:"
                  />
                  <PriceChangeBadge
                    value={post.priceChanges.day30}
                    status={post.priceChanges.day30Status}
                    label="30d:"
                  />
                </div>
              </div>
            ))}
            {/* "Show more" button — only when posts are truncated */}
            {showMoreButton && (
              <Button asChild variant="ghost" className="mt-2 w-full justify-center">
                <Link href={ROUTES.KOL_STOCK_DETAIL(kolId, stock.ticker)}>
                  {t('detail.postsByStock.showMore', { count: stock.posts.length })}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
