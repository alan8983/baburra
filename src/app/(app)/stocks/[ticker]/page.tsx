'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, HelpCircle, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ROUTES } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils/date';
import { SENTIMENT_COLORS } from '@/domain/models/post';
import { sentimentKey } from '@/lib/utils/sentiment';
import { useStockPricesForChart } from '@/hooks/use-stock-prices';
import {
  ChartToolbar,
  aggregateCandles,
  aggregateVolumes,
  getStartDateForRange,
} from '@/components/charts';
import type { LineChartMarker, CandleInterval, TimeRange } from '@/components/charts';
import { useStock, useStockPosts, useStockReturnRate } from '@/hooks';
import { formatReturnRate, getReturnRateColorClass } from '@/domain/calculators';

const CandlestickChart = dynamic(
  () =>
    import('@/components/charts/candlestick-chart').then((mod) => ({
      default: mod.CandlestickChart,
    })),
  { ssr: false }
);

const SentimentLineChart = dynamic(
  () =>
    import('@/components/charts/sentiment-line-chart').then((mod) => ({
      default: mod.SentimentLineChart,
    })),
  { ssr: false }
);

function toDateStr(postedAt: Date | string): string {
  if (postedAt instanceof Date) return postedAt.toISOString().slice(0, 10);
  const s = String(postedAt);
  return s.includes('T') ? s.slice(0, 10) : s.slice(0, 10);
}

export default function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const t = useTranslations('stocks');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { ticker } = use(params);
  const decodedTicker = decodeURIComponent(ticker);

  const { data: stock, isLoading: stockLoading, error: stockError } = useStock(decodedTicker);
  const { data: postsData, isLoading: postsLoading } = useStockPosts(decodedTicker);
  const { data: returnRateStats, isLoading: returnRateLoading } = useStockReturnRate(decodedTicker);
  const posts = postsData?.data ?? [];

  // Chart state
  const [interval, setInterval] = useState<CandleInterval>('day');
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
  const startDate = useMemo(() => getStartDateForRange(timeRange), [timeRange]);
  const {
    data: chartData,
    isLoading: chartLoading,
    error: chartError,
  } = useStockPricesForChart(decodedTicker, { startDate });

  const aggCandles = useMemo(
    () => (chartData ? aggregateCandles(chartData.candles, interval) : []),
    [chartData, interval]
  );
  const aggVolumes = useMemo(
    () => (chartData ? aggregateVolumes(chartData.volumes, chartData.candles, interval) : []),
    [chartData, interval]
  );

  // Sentiment markers for line chart
  const markers: LineChartMarker[] = posts.map((post) => {
    const currentStock = post.stocks.find((s) => s.ticker === decodedTicker);
    return {
      time: toDateStr(post.postedAt),
      sentiment: currentStock?.sentiment ?? post.sentiment,
      text: post.kol.name,
      postId: post.id,
    };
  });

  if (stockError || (!stockLoading && !stock)) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.STOCKS}>{t('detail.backToList')}</Link>
        </Button>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">{t('detail.errors.loadFailed')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (stockLoading || !stock) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.STOCKS}>{t('detail.backToList')}</Link>
        </Button>
        <p className="text-muted-foreground">{t('detail.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href={ROUTES.STOCKS}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('detail.backToList')}
        </Link>
      </Button>

      {/* Stock Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="bg-primary/10 text-primary flex h-16 w-16 items-center justify-center rounded-lg text-2xl font-bold">
              {stock.ticker.slice(0, 2)}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <h1 className="text-2xl font-bold">{stock.ticker}</h1>
                <Badge variant="outline">{stock.market}</Badge>
              </div>
              <p className="text-muted-foreground mt-1">{stock.name}</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4 sm:justify-start">
                <Badge variant="outline">
                  {t('detail.stats.postCount')} {stock.postCount}
                </Badge>
                <Badge
                  variant="default"
                  className={
                    stock.returnRate != null && stock.returnRate >= 0 ? 'bg-green-600' : ''
                  }
                >
                  {stock.returnRate != null
                    ? t('detail.stats.returnRate30d', {
                        percent: `${stock.returnRate >= 0 ? '+' : ''}${stock.returnRate.toFixed(1)}`,
                      })
                    : '—'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top 2-column: Charts + Return Rate */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column: Sentiment chart + Return rate stats */}
        <div className="flex flex-col gap-6">
          {/* Sentiment Line Chart */}
          <Card>
            <CardHeader>
              <CardTitle>{t('detail.sentimentChart.title')}</CardTitle>
              <CardDescription>{t('detail.sentimentChart.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {chartLoading ? (
                <div className="flex h-[250px] items-center justify-center">
                  <p className="text-muted-foreground">{t('detail.priceLoading')}</p>
                </div>
              ) : chartError || !chartData ? (
                <div className="flex h-[250px] items-center justify-center">
                  <p className="text-muted-foreground">
                    {chartError?.message ?? t('detail.errors.priceError')}
                  </p>
                </div>
              ) : chartData.candles.length === 0 ? (
                <div className="flex h-[250px] items-center justify-center">
                  <p className="text-muted-foreground">{t('detail.errors.noPriceData')}</p>
                </div>
              ) : (
                <SentimentLineChart
                  candles={chartData.candles}
                  sentimentMarkers={markers}
                  onMarkerClick={(postId) => router.push(ROUTES.POST_DETAIL(postId))}
                  height={250}
                  className="rounded-lg border"
                />
              )}
            </CardContent>
          </Card>

          {/* Return Rate Stats */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>{t('detail.returnRate.title')}</CardTitle>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground -mt-0.5 transition-colors">
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
                      <li>• {t('detail.returnRate.explanation.allKols')}</li>
                    </ul>
                  </PopoverContent>
                </Popover>
              </div>
              <CardDescription>{t('detail.returnRate.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {returnRateLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                  <span className="text-muted-foreground ml-2">
                    {t('detail.returnRate.analyzing')}
                  </span>
                </div>
              ) : returnRateStats ? (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    {
                      key: 'day5',
                      label: t('detail.returnRate.periods.5d'),
                      data: returnRateStats.day5,
                    },
                    {
                      key: 'day30',
                      label: t('detail.returnRate.periods.30d'),
                      data: returnRateStats.day30,
                    },
                    {
                      key: 'day90',
                      label: t('detail.returnRate.periods.90d'),
                      data: returnRateStats.day90,
                    },
                    {
                      key: 'day365',
                      label: t('detail.returnRate.periods.365d'),
                      data: returnRateStats.day365,
                    },
                  ].map((item) => (
                    <div key={item.key} className="rounded-lg border p-2 text-center">
                      <p className="text-muted-foreground text-xs font-medium">{item.label}</p>
                      <p
                        className={`mt-1 text-lg font-bold ${getReturnRateColorClass(item.data.avgReturn)}`}
                      >
                        {formatReturnRate(item.data.avgReturn)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {t('detail.returnRate.posNeg', {
                          positive: item.data.positiveCount,
                          negative: item.data.negativeCount,
                          na: item.data.naCount,
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center">
                  {t('detail.returnRate.loadFailed')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Candlestick chart */}
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.chart.title')}</CardTitle>
            <CardDescription>{t('detail.chart.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartToolbar
              interval={interval}
              onIntervalChange={setInterval}
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
            />
            {chartLoading ? (
              <div className="flex h-[400px] items-center justify-center">
                <p className="text-muted-foreground">{t('detail.priceLoading')}</p>
              </div>
            ) : chartError || !chartData ? (
              <div className="flex h-[400px] items-center justify-center">
                <p className="text-muted-foreground">
                  {chartError?.message ?? t('detail.errors.priceError')}
                </p>
              </div>
            ) : chartData.candles.length === 0 ? (
              <div className="flex h-[400px] items-center justify-center">
                <p className="text-muted-foreground">{t('detail.errors.noPriceData')}</p>
              </div>
            ) : (
              <CandlestickChart
                candles={aggCandles}
                volumes={aggVolumes}
                height={400}
                className="rounded-lg border"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom 2-column: Arguments + Posts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Arguments placeholder */}
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.arguments.title')}</CardTitle>
            <CardDescription>{t('detail.arguments.noArgumentsHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-muted-foreground flex h-48 items-center justify-center rounded-lg border border-dashed text-sm">
              {t('detail.arguments.noArguments')}
            </div>
          </CardContent>
        </Card>

        {/* Right: Posts list */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>{t('detail.posts.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {postsLoading && <p className="text-muted-foreground">{t('detail.posts.loading')}</p>}
            {!postsLoading && posts.length === 0 && (
              <p className="text-muted-foreground">{t('detail.posts.noPosts')}</p>
            )}
            {!postsLoading &&
              posts.map((post) => {
                const currentStock = post.stocks.find((s) => s.ticker === decodedTicker);
                const changes =
                  currentStock && post.priceChanges ? post.priceChanges[currentStock.id] : null;
                return (
                  <div
                    key={post.id}
                    className="hover:bg-muted/50 cursor-pointer rounded-lg border p-3 transition-colors"
                    onClick={() => {
                      router.push(ROUTES.POST_DETAIL(post.id));
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={post.kol.avatarUrl || undefined} />
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={ROUTES.KOL_DETAIL(post.kol.id)}
                            className="text-sm font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {post.kol.name}
                          </Link>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              SENTIMENT_COLORS[
                                (currentStock?.sentiment ??
                                  post.sentiment) as keyof typeof SENTIMENT_COLORS
                              ]
                            }`}
                          >
                            {tCommon(
                              `sentiment.${sentimentKey(currentStock?.sentiment ?? post.sentiment)}`
                            )}
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            {formatDateTime(post.postedAt)}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-1.5 line-clamp-2 text-xs">
                          {post.content}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                          <span
                            className={
                              changes?.day5 != null
                                ? changes.day5 >= 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                                : 'text-muted-foreground'
                            }
                          >
                            {t('detail.priceChange.5d')}{' '}
                            {changes?.day5 != null
                              ? `${changes.day5 >= 0 ? '+' : ''}${changes.day5.toFixed(1)}%`
                              : '—'}
                          </span>
                          <span
                            className={
                              changes?.day30 != null
                                ? changes.day30 >= 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                                : 'text-muted-foreground'
                            }
                          >
                            {t('detail.priceChange.30d')}{' '}
                            {changes?.day30 != null
                              ? `${changes.day30 >= 0 ? '+' : ''}${changes.day30.toFixed(1)}%`
                              : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
