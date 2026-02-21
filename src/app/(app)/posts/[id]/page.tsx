'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
import {
  usePost,
  useBookmarkStatus,
  useToggleBookmark,
  usePostArguments,
  useDeletePost,
} from '@/hooks';
import type { TickerArgumentGroup } from '@/components/ai/post-arguments';

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

const PostArguments = dynamic(() =>
  import('@/components/ai/post-arguments').then((mod) => ({ default: mod.PostArguments }))
);
import { FRAMEWORK_CATEGORIES } from '@/domain/models/argument-categories';
import type { PostArgumentResponse } from '@/hooks/use-ai';
import type { Sentiment } from '@/domain/models/post';

function toDateString(postedAt: Date | string): string {
  if (postedAt instanceof Date) return postedAt.toISOString().slice(0, 10);
  const s = String(postedAt);
  if (s.includes('-')) return s.slice(0, 10);
  const [d] = s.split(' ');
  if (!d) return s;
  const [y, m, day] = d.split('/');
  return [y, m?.padStart(2, '0'), day?.padStart(2, '0')].filter(Boolean).join('-');
}

function PostChartTab({
  stocks,
  postedAt,
  sentiment,
  kolName,
  postId,
}: {
  stocks: { id: string; ticker: string; name: string; sentiment: Sentiment | null }[];
  postedAt: Date | string;
  sentiment: number;
  kolName: string;
  postId: string;
}) {
  const t = useTranslations('posts');
  const dateStr = toDateString(postedAt);

  if (stocks.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground">{t('detail.noStocks')}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {stocks.map((stock) => {
        const marker: LineChartMarker = {
          time: dateStr,
          sentiment: stock.sentiment ?? sentiment,
          text: kolName,
          postId,
        };
        return (
          <PostStockChart
            key={stock.id}
            ticker={stock.ticker}
            name={stock.name}
            sentimentMarker={marker}
          />
        );
      })}
    </div>
  );
}

function PostStockChart({
  ticker,
  name,
  sentimentMarker,
}: {
  ticker: string;
  name: string;
  sentimentMarker: LineChartMarker;
}) {
  const t = useTranslations('posts');
  const [interval, setInterval] = useState<CandleInterval>('day');
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');

  const startDate = useMemo(() => getStartDateForRange(timeRange), [timeRange]);
  const { data, isLoading, error } = useStockPricesForChart(ticker, { startDate });

  const aggCandles = useMemo(
    () => (data ? aggregateCandles(data.candles, interval) : []),
    [data, interval]
  );
  const aggVolumes = useMemo(
    () => (data ? aggregateVolumes(data.volumes, data.candles, interval) : []),
    [data, interval]
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{ticker}</CardTitle>
          <CardDescription>{name}</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[360px] items-center justify-center">
          <p className="text-muted-foreground">{t('detail.loadingPrice')}</p>
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{ticker}</CardTitle>
          <CardDescription>{name}</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[360px] items-center justify-center">
          <p className="text-muted-foreground">{error?.message ?? t('detail.priceError')}</p>
        </CardContent>
      </Card>
    );
  }
  if (data.candles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{ticker}</CardTitle>
          <CardDescription>{name}</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[360px] items-center justify-center">
          <p className="text-muted-foreground">{t('detail.noPriceData')}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{ticker}</CardTitle>
          <CardDescription>
            {name} · {t('detail.chartDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartToolbar
            interval={interval}
            onIntervalChange={setInterval}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
          />
          <CandlestickChart
            candles={aggCandles}
            volumes={aggVolumes}
            height={360}
            className="rounded-lg border"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('detail.sentimentChart.title')}</CardTitle>
          <CardDescription>
            {name} · {t('detail.chartDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SentimentLineChart
            candles={data.candles}
            sentimentMarkers={[sentimentMarker]}
            height={200}
            className="rounded-lg border"
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Transform PostArgumentResponse[] to TickerArgumentGroup[] by grouping by stockId
 */
function transformPostArguments(
  args: PostArgumentResponse[],
  stocks: { id: string; ticker: string; name: string }[],
  fallbackParentName: string
): TickerArgumentGroup[] {
  const stockMap = new Map(stocks.map((s) => [s.id, s]));
  const grouped = new Map<string, PostArgumentResponse[]>();
  for (const arg of args) {
    const existing = grouped.get(arg.stockId) || [];
    existing.push(arg);
    grouped.set(arg.stockId, existing);
  }
  return Array.from(grouped.entries()).map(([stockId, stockArgs]) => {
    const stock = stockMap.get(stockId);
    return {
      ticker: stock?.ticker ?? 'Unknown',
      name: stock?.name ?? '',
      arguments: stockArgs.map((arg) => {
        const fw = FRAMEWORK_CATEGORIES[arg.category.code];
        return {
          id: arg.id,
          categoryCode: arg.category.code,
          categoryName: fw?.name ?? arg.category.name,
          parentName: fw?.parentName ?? fallbackParentName,
          originalText: arg.originalText,
          summary: arg.summary,
          sentiment: arg.sentiment as Sentiment,
          confidence: arg.confidence,
        };
      }),
    };
  });
}

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations('posts');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { id } = use(params);
  const { data: post, isLoading, error } = usePost(id);
  const { data: postArgs } = usePostArguments(id);
  const { data: bookmarkData } = useBookmarkStatus(id);
  const toggleBookmark = useToggleBookmark(id);
  const deletePost = useDeletePost();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isBookmarked = bookmarkData?.isBookmarked ?? false;

  if (error || (!isLoading && !post)) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.POSTS}>{t('detail.backToList')}</Link>
        </Button>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">{t('detail.priceError')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (isLoading || !post) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.POSTS}>{t('detail.backToList')}</Link>
        </Button>
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.POSTS}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('detail.backToList')}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Popover open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3">
              <p className="text-sm font-medium">{t('detail.deleteConfirm')}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={deletePost.isPending}
                  onClick={() =>
                    deletePost.mutate(id, {
                      onSuccess: () => {
                        toast.success(t('detail.deleteSuccess'));
                        router.push(ROUTES.POSTS);
                      },
                      onError: () => toast.error(t('detail.deleteFailed')),
                    })
                  }
                >
                  {t('detail.deleteConfirmYes')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                  {t('detail.deleteConfirmNo')}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant={isBookmarked ? 'default' : 'outline'}
            size="sm"
            onClick={() =>
              toggleBookmark.mutate(isBookmarked, {
                onSuccess: () => {
                  toast.success(
                    isBookmarked ? t('detail.bookmarkRemoved') : t('detail.bookmarkAdded')
                  );
                },
              })
            }
            disabled={toggleBookmark.isPending}
          >
            {isBookmarked ? (
              <>
                <BookmarkCheck className="mr-2 h-4 w-4" />
                {t('detail.bookmarked')}
              </>
            ) : (
              <>
                <Bookmark className="mr-2 h-4 w-4" />
                {t('detail.bookmark')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Shared Heading */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.kol.avatarUrl || undefined} />
            <AvatarFallback>
              <User className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={ROUTES.KOL_DETAIL(post.kol.id)} className="font-semibold hover:underline">
                {post.kol.name}
              </Link>
              <Badge variant="outline" className={SENTIMENT_COLORS[post.sentiment]}>
                {tCommon(`sentiment.${sentimentKey(post.sentiment)}`)}
              </Badge>
              {post.sentimentAiGenerated && (
                <span className="text-muted-foreground text-xs">{t('detail.aiGenerated')}</span>
              )}
            </div>
            <p className="text-muted-foreground text-sm">{formatDateTime(post.postedAt)}</p>
          </div>
          {post.sourceUrl && (
            <a
              href={post.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hidden items-center gap-1 text-sm hover:underline sm:inline-flex"
            >
              <ExternalLink className="h-3 w-3" />
              {t('detail.sourceLink', { platform: post.sourcePlatform })}
            </a>
          )}
        </div>

        {/* Stock targets with price changes */}
        {post.stocks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.stocks.map((stock) => {
              const changes = post.priceChanges?.[stock.id];
              return (
                <div
                  key={stock.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                >
                  <Link
                    href={ROUTES.STOCK_DETAIL(stock.ticker)}
                    className="font-medium hover:underline"
                  >
                    {stock.ticker}
                  </Link>
                  <span className="text-muted-foreground">{stock.name}</span>
                  {stock.sentiment !== null && stock.sentiment !== post.sentiment && (
                    <Badge
                      variant="outline"
                      className={SENTIMENT_COLORS[stock.sentiment as Sentiment]}
                    >
                      {tCommon(`sentiment.${sentimentKey(stock.sentiment)}`)}
                    </Badge>
                  )}
                  <span
                    className={
                      changes?.day5 != null
                        ? changes.day5 >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                        : 'text-muted-foreground'
                    }
                  >
                    {t('detail.priceChange5d')}{' '}
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
                    {t('detail.priceChange30d')}{' '}
                    {changes?.day30 != null
                      ? `${changes.day30 >= 0 ? '+' : ''}${changes.day30.toFixed(1)}%`
                      : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Source URL for mobile */}
        {post.sourceUrl && (
          <a
            href={post.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 text-sm hover:underline sm:hidden"
          >
            <ExternalLink className="h-3 w-3" />
            {t('detail.sourceLink', { platform: post.sourcePlatform })}
          </a>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column: Post content */}
        <div className="min-w-0">
          <Card>
            <CardContent className="pt-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {post.content.split('\n').map((line, i) => (
                  <p key={i} className={line === '' ? 'h-4' : ''}>
                    {line}
                  </p>
                ))}
              </div>

              {post.images.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {post.images.map((img, i) => (
                    <div key={i} className="relative aspect-video overflow-hidden rounded-lg">
                      <Image
                        src={img}
                        alt={t('detail.image', { index: i + 1 })}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Charts */}
        <div className="min-w-0">
          <PostChartTab
            stocks={post.stocks}
            postedAt={post.postedAt}
            sentiment={post.sentiment}
            kolName={post.kol.name}
            postId={post.id}
          />
        </div>
      </div>

      {/* Arguments section */}
      {postArgs && postArgs.length > 0 && (
        <PostArguments
          tickerGroups={transformPostArguments(postArgs, post.stocks, tCommon('ai.otherCategory'))}
        />
      )}
    </div>
  );
}
