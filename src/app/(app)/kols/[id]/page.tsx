'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  HelpCircle,
  Loader2,
  RefreshCw,
  User,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/utils/date';
import { type Sentiment } from '@/domain/models/post';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { sentimentKey } from '@/lib/utils/sentiment';
import { PriceChangeBadge } from '@/components/shared/price-change-badge';
import { useStockPricesForChart } from '@/hooks/use-stock-prices';
import type { LineChartMarker } from '@/components/charts';
import {
  useKol,
  useKolPosts,
  useKolSources,
  useActiveScrapeForKol,
  useReanalyzeBatch,
  useKolFollowerCount,
} from '@/hooks';
import { SubscriptionToggle } from '@/components/kol/subscription-toggle';
import { useUnlockChecks } from '@/hooks/use-unlocks';
import { UnlockCta } from '@/components/paywall/unlock-cta';
import { formatReturnRate, getReturnRateColorClass } from '@/domain/calculators';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KolScorecard } from './_components/kol-scorecard';

const SentimentLineChart = dynamic(
  () =>
    import('@/components/charts/sentiment-line-chart').then((mod) => ({
      default: mod.SentimentLineChart,
    })),
  { ssr: false }
);

// ─── Types ────────────────────────────────────────────────────────────────────

type PriceChangeStatusType = 'pending' | 'no_data' | 'value';

type StockPost = {
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

type StockGroup = {
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

function calcPeriodStats(posts: StockPost[], period: 'day5' | 'day30' | 'day90' | 'day365') {
  const statusKey = `${period}Status` as const;
  const nonNeutral = posts.filter((p) => p.sentiment !== 0);
  if (!nonNeutral.length)
    return { avgReturn: null, positiveCount: 0, negativeCount: 0, allPending: false };

  const pendingCount = nonNeutral.filter((p) => p.priceChanges[statusKey] === 'pending').length;
  const allPending = pendingCount === nonNeutral.length;

  const relevant = nonNeutral.filter((p) => p.priceChanges[period] != null);
  if (!relevant.length) return { avgReturn: null, positiveCount: 0, negativeCount: 0, allPending };

  const returns = relevant.map((p) => {
    const change = p.priceChanges[period]!;
    return p.sentiment > 0 ? change : -change;
  });
  return {
    avgReturn: returns.reduce((a, b) => a + b, 0) / returns.length,
    positiveCount: returns.filter((r) => r > 0).length,
    negativeCount: returns.filter((r) => r < 0).length,
    allPending,
  };
}

// ─── Per-stock row sub-component ──────────────────────────────────────────────

function KolStockSection({ stock, kolId }: { stock: StockGroup; kolId: string }) {
  const t = useTranslations('kols');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { palette, colors } = useColorPalette();

  const unlockChecks = useUnlockChecks();
  const isL2Unlocked = unlockChecks.hasLayer2(kolId, stock.stockId);

  const { data: chartData, isLoading: chartLoading } = useStockPricesForChart(stock.ticker);

  const markers: LineChartMarker[] = stock.posts.map((post) => ({
    time: toDateStr(post.postedAt),
    sentiment: post.sentiment,
    postId: post.id,
  }));

  const periodStats = useMemo(
    () => ({
      day5: calcPeriodStats(stock.posts, 'day5'),
      day30: calcPeriodStats(stock.posts, 'day30'),
      day90: calcPeriodStats(stock.posts, 'day90'),
      day365: calcPeriodStats(stock.posts, 'day365'),
    }),
    [stock.posts]
  );

  // Win rate: % of non-neutral posts with positive return (using 30d as primary window)
  const nonNeutral = stock.posts.filter((p) => p.sentiment !== 0 && p.priceChanges.day30 != null);
  const winCount = nonNeutral.filter((p) => {
    const change = p.priceChanges.day30!;
    return p.sentiment > 0 ? change > 0 : change < 0;
  }).length;
  const winRate = nonNeutral.length > 0 ? (winCount / nonNeutral.length) * 100 : null;

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

              {/* Win rate */}
              {winRate != null && (
                <div className="flex items-center justify-between rounded-lg border p-2">
                  <span className="text-muted-foreground text-xs">{t('detail.winRate')}</span>
                  <span
                    className={`text-sm font-bold ${winRate >= 50 ? colors.bullish.text : colors.bearish.text}`}
                  >
                    {winRate.toFixed(1)}%
                    <span className="text-muted-foreground ml-1 text-xs font-normal">
                      ({winCount}/{nonNeutral.length})
                    </span>
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
            {stock.posts.map((post) => (
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations('kols');
  const tPosts = useTranslations('posts');
  const { id } = use(params);
  const { data: kol, isLoading: kolLoading, error: kolError } = useKol(id);
  const { data: postsData, isLoading: postsLoading } = useKolPosts(id);
  const { data: kolSources } = useKolSources(id);
  const activeScrape = useActiveScrapeForKol(id);
  const reanalyzeBatch = useReanalyzeBatch();
  const { data: followerData } = useKolFollowerCount(id);

  // Group posts by stock, capturing all price-change periods
  const postsByStock = useMemo<StockGroup[]>(() => {
    const list = postsData?.data ?? [];
    const map = new Map<string, StockGroup>();
    for (const post of list) {
      const priceChanges = post.priceChanges ?? {};
      for (const stock of post.stocks) {
        if (!map.has(stock.id)) {
          map.set(stock.id, {
            stockId: stock.id,
            ticker: stock.ticker,
            name: stock.name,
            posts: [],
          });
        }
        const pc = priceChanges[stock.id];
        map.get(stock.id)!.posts.push({
          id: post.id,
          content: post.content,
          sentiment: (stock.sentiment ?? post.sentiment) as Sentiment,
          postedAt: post.postedAt,
          priceChanges: {
            day5: pc?.day5 ?? null,
            day30: pc?.day30 ?? null,
            day90: pc?.day90 ?? null,
            day365: pc?.day365 ?? null,
            day5Status: pc?.day5Status ?? 'no_data',
            day30Status: pc?.day30Status ?? 'no_data',
            day90Status: pc?.day90Status ?? 'no_data',
            day365Status: pc?.day365Status ?? 'no_data',
          },
        });
      }
    }
    return Array.from(map.values());
  }, [postsData?.data]);

  // Flatten all stock-level posts for the scorecard
  const allStockPosts = useMemo(() => {
    return postsByStock.flatMap((stock) =>
      stock.posts.map((p) => ({
        id: p.id,
        stockTicker: stock.ticker,
        stockName: stock.name,
        sentiment: p.sentiment,
        priceChanges: p.priceChanges,
      }))
    );
  }, [postsByStock]);

  const hasInferredTickers = useMemo(() => {
    const list = postsData?.data ?? [];
    return list.some((post) => post.stocks.some((s) => s.source === 'inferred'));
  }, [postsData?.data]);

  const stalePosts = useMemo(() => {
    const currentModel = postsData?.currentAiModel;
    if (!currentModel || !postsData?.data) return [];
    return postsData.data.filter(
      (p) => p.aiModelVersion == null || p.aiModelVersion !== currentModel
    );
  }, [postsData]);

  if (kolError || (!kolLoading && !kol)) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.KOLS}>{t('detail.backToList')}</Link>
        </Button>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">{t('detail.errors.loadFailed')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (kolLoading || !kol) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.KOLS}>{t('detail.backToList')}</Link>
        </Button>
        <p className="text-muted-foreground">{t('detail.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href={ROUTES.KOLS}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('detail.backToList')}
        </Link>
      </Button>

      {/* KOL Scorecard */}
      <KolScorecard
        kol={kol}
        followerCount={followerData?.followerCount}
        sources={kolSources}
        kolId={id}
        stockPosts={allStockPosts}
        hasInferredTickers={hasInferredTickers}
      />

      {/* Scrape in-progress banner */}
      {activeScrape && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            {t('detail.scrapeInProgress', {
              processed: activeScrape.processedUrls ?? 0,
              total: activeScrape.totalUrls ?? 0,
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* Batch re-analyze banner */}
      {stalePosts.length > 0 && (
        <Alert>
          <RefreshCw className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{tPosts('detail.reanalyze.bannerLegacy')}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={reanalyzeBatch.isPending}
              onClick={() => {
                const ids = stalePosts.slice(0, 10).map((p) => p.id);
                reanalyzeBatch.mutate(ids, {
                  onSuccess: (result) => {
                    toast.success(
                      tPosts('detail.reanalyze.batchProgress', {
                        done: result.success,
                        total: ids.length,
                      })
                    );
                  },
                  onError: () => toast.error(tPosts('detail.reanalyze.failed')),
                });
              }}
            >
              {reanalyzeBatch.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {tPosts('detail.reanalyze.batchButton', { count: stalePosts.length })}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Per-stock sections */}
      {postsLoading ? (
        <p className="text-muted-foreground">{t('detail.postsByStock.loading')}</p>
      ) : postsByStock.length === 0 ? (
        <p className="text-muted-foreground">{t('detail.postsByStock.noPosts')}</p>
      ) : (
        <div className="space-y-2">
          {postsByStock.map((stock, i) => (
            <div key={stock.stockId}>
              {i > 0 && <Separator className="my-8" />}
              <KolStockSection stock={stock} kolId={id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
