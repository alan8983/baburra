'use client';

import { use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ROUTES } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils/date';
import { SENTIMENT_LABELS, SENTIMENT_COLORS } from '@/domain/models/post';
import { useStockPricesForChart } from '@/hooks/use-stock-prices';
import {
  CandlestickChart,
  postToSentimentMarker,
  SentimentMarkerLegend,
} from '@/components/charts';
import { usePost, useBookmarkStatus, useToggleBookmark } from '@/hooks';

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
}: {
  stocks: { id: string; ticker: string; name: string }[];
  postedAt: Date | string;
  sentiment: number;
}) {
  const dateStr = toDateString(postedAt);
  const sentimentMarker = postToSentimentMarker(dateStr, sentiment, {
    text: '本篇發文',
  });
  if (stocks.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground">此文章無關聯標的</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {stocks.map((stock) => (
        <PostStockChart
          key={stock.id}
          ticker={stock.ticker}
          name={stock.name}
          sentimentMarkers={[sentimentMarker]}
        />
      ))}
    </div>
  );
}

function PostStockChart({
  ticker,
  name,
  sentimentMarkers,
}: {
  ticker: string;
  name: string;
  sentimentMarkers: { time: string; sentiment: number; text?: string }[];
}) {
  const { data, isLoading, error } = useStockPricesForChart(ticker);
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{ticker}</CardTitle>
          <CardDescription>{name}</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[360px] items-center justify-center">
          <p className="text-muted-foreground">載入股價中...</p>
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
          <p className="text-muted-foreground">{error?.message ?? '無法載入股價'}</p>
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
          <p className="text-muted-foreground">此標的暫無股價資料</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ticker}</CardTitle>
        <CardDescription>{name} · 股價走勢與本篇發文標記</CardDescription>
      </CardHeader>
      <CardContent>
        <CandlestickChart
          candles={data.candles}
          volumes={data.volumes}
          sentimentMarkers={sentimentMarkers}
          height={360}
          className="rounded-lg border"
        />
        <SentimentMarkerLegend markers={sentimentMarkers} />
      </CardContent>
    </Card>
  );
}

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: post, isLoading, error } = usePost(id);
  const { data: bookmarkData } = useBookmarkStatus(id);
  const toggleBookmark = useToggleBookmark(id);
  const isBookmarked = bookmarkData?.isBookmarked ?? false;

  if (error || (!isLoading && !post)) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.POSTS}>返回文章列表</Link>
        </Button>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">無法載入文章或找不到該文章</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (isLoading || !post) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.POSTS}>返回文章列表</Link>
        </Button>
        <p className="text-muted-foreground">載入中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.POSTS}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回文章列表
          </Link>
        </Button>
        <Button
          variant={isBookmarked ? 'default' : 'outline'}
          size="sm"
          onClick={() =>
            toggleBookmark.mutate(isBookmarked, {
              onSuccess: () => {
                toast.success(isBookmarked ? '已移除書籤' : '已加入書籤');
              },
            })
          }
          disabled={toggleBookmark.isPending}
        >
          {isBookmarked ? (
            <>
              <BookmarkCheck className="mr-2 h-4 w-4" />
              已加入書籤
            </>
          ) : (
            <>
              <Bookmark className="mr-2 h-4 w-4" />
              加入書籤
            </>
          )}
        </Button>
      </div>

      {/* Post Header */}
      <Card>
        <CardContent className="pt-6">
          {/* KOL Info */}
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={post.kol.avatarUrl || undefined} />
              <AvatarFallback>
                <User className="h-6 w-6" />
              </AvatarFallback>
            </Avatar>
            <div>
              <Link href={ROUTES.KOL_DETAIL(post.kol.id)} className="font-medium hover:underline">
                {post.kol.name}
              </Link>
              <p className="text-muted-foreground text-sm">{formatDateTime(post.postedAt)}</p>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Stocks & Price Changes */}
          <div className="space-y-3">
            {post.stocks.map((stock) => {
              const changes = post.priceChanges?.[stock.id];
              return (
                <div
                  key={stock.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2">
                    <Link
                      href={ROUTES.STOCK_DETAIL(stock.ticker)}
                      className="font-medium hover:underline"
                    >
                      {stock.ticker}
                    </Link>
                    <span className="text-muted-foreground text-sm">{stock.name}</span>
                    <Badge variant="outline" className={SENTIMENT_COLORS[post.sentiment]}>
                      {SENTIMENT_LABELS[post.sentiment]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span
                      className={
                        changes?.day5 != null
                          ? changes.day5 >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                          : 'text-muted-foreground'
                      }
                    >
                      5日:{' '}
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
                      30日:{' '}
                      {changes?.day30 != null
                        ? `${changes.day30 >= 0 ? '+' : ''}${changes.day30.toFixed(1)}%`
                        : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Source URL */}
          {post.sourceUrl && (
            <div className="mt-4">
              <a
                href={post.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                查看原文 ({post.sourcePlatform})
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="content" className="space-y-4">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="chart">Chart</TabsTrigger>
        </TabsList>

        {/* Content Tab */}
        <TabsContent value="content">
          <Card>
            <CardContent className="pt-6">
              {/* Sentiment Badge */}
              <div className="mb-4 flex items-center gap-2">
                <Badge variant="outline" className={SENTIMENT_COLORS[post.sentiment]}>
                  {SENTIMENT_LABELS[post.sentiment]}
                </Badge>
                {post.sentimentAiGenerated && (
                  <span className="text-muted-foreground text-xs">(AI 分析)</span>
                )}
              </div>

              {/* Content */}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {post.content.split('\n').map((line, i) => (
                  <p key={i} className={line === '' ? 'h-4' : ''}>
                    {line}
                  </p>
                ))}
              </div>

              {/* Images */}
              {post.images.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {post.images.map((img, i) => (
                    <div key={i} className="relative aspect-video overflow-hidden rounded-lg">
                      <Image src={img} alt={`圖片 ${i + 1}`} fill className="object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chart Tab */}
        <TabsContent value="chart">
          <PostChartTab stocks={post.stocks} postedAt={post.postedAt} sentiment={post.sentiment} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
