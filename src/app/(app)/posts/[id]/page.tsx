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
import { ROUTES } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils/date';
import { SENTIMENT_LABELS, SENTIMENT_COLORS } from '@/domain/models/post';
import { useStockPricesForChart } from '@/hooks/use-stock-prices';
import { CandlestickChart, SentimentLineChart } from '@/components/charts';
import type { LineChartMarker } from '@/components/charts';
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
  kolName,
  postId,
}: {
  stocks: { id: string; ticker: string; name: string }[];
  postedAt: Date | string;
  sentiment: number;
  kolName: string;
  postId: string;
}) {
  const dateStr = toDateString(postedAt);
  const marker: LineChartMarker = {
    time: dateStr,
    sentiment,
    text: kolName,
    postId,
  };

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
          sentimentMarker={marker}
        />
      ))}
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{ticker}</CardTitle>
          <CardDescription>{name} · K 線圖</CardDescription>
        </CardHeader>
        <CardContent>
          <CandlestickChart
            candles={data.candles}
            volumes={data.volumes}
            height={360}
            className="rounded-lg border"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>KOL 觀點分析</CardTitle>
          <CardDescription>{name} · 收盤價走勢與本篇發文標記</CardDescription>
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

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: post, isLoading, error } = usePost(id);
  const { data: bookmarkData } = useBookmarkStatus(id);
  const toggleBookmark = useToggleBookmark(id);
  const isBookmarked = bookmarkData?.isBookmarked ?? false;

  if (error || (!isLoading && !post)) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
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
      <div className="mx-auto max-w-7xl space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.POSTS}>返回文章列表</Link>
        </Button>
        <p className="text-muted-foreground">載入中...</p>
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
              <Link
                href={ROUTES.KOL_DETAIL(post.kol.id)}
                className="font-semibold hover:underline"
              >
                {post.kol.name}
              </Link>
              <Badge variant="outline" className={SENTIMENT_COLORS[post.sentiment]}>
                {SENTIMENT_LABELS[post.sentiment]}
              </Badge>
              {post.sentimentAiGenerated && (
                <span className="text-muted-foreground text-xs">(AI 分析)</span>
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
              查看原文 ({post.sourcePlatform})
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
            查看原文 ({post.sourcePlatform})
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
                      <Image src={img} alt={`圖片 ${i + 1}`} fill className="object-cover" />
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
    </div>
  );
}
