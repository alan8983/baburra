'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ROUTES } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils/date';
import { SENTIMENT_LABELS, SENTIMENT_COLORS } from '@/domain/models/post';
import { useStockPricesForChart } from '@/hooks/use-stock-prices';
import { CandlestickChart } from '@/components/charts';
import { useStock, useStockPosts, useStockWinRate } from '@/hooks';
import { formatWinRate, getWinRateColorClass } from '@/domain/calculators';
import { StockArgumentsTab } from '@/components/ai';

function StockChartTab({ ticker }: { ticker: string }) {
  const { data, isLoading, error } = useStockPricesForChart(ticker);
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-[400px] items-center justify-center">
          <p className="text-muted-foreground">載入股價中...</p>
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex h-[400px] items-center justify-center">
          <p className="text-muted-foreground">
            {error?.message ?? '無法載入股價，請確認標的代碼或 Tiingo API 設定'}
          </p>
        </CardContent>
      </Card>
    );
  }
  if (data.candles.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[400px] items-center justify-center">
          <p className="text-muted-foreground">此標的暫無股價資料</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>K 線圖</CardTitle>
        <CardDescription>股價走勢圖與 KOL 觀點標記</CardDescription>
      </CardHeader>
      <CardContent>
        <CandlestickChart
          candles={data.candles}
          volumes={data.volumes}
          height={400}
          className="rounded-lg border"
        />
      </CardContent>
    </Card>
  );
}

export default function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const decodedTicker = decodeURIComponent(ticker);
  const { data: stock, isLoading: stockLoading, error: stockError } = useStock(decodedTicker);
  const { data: postsData, isLoading: postsLoading } = useStockPosts(decodedTicker);
  const { data: winRateStats, isLoading: winRateLoading } = useStockWinRate(decodedTicker);
  const posts = postsData?.data ?? [];

  if (stockError || (!stockLoading && !stock)) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.STOCKS}>返回標的列表</Link>
        </Button>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">無法載入標的或找不到該標的</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (stockLoading || !stock) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.STOCKS}>返回標的列表</Link>
        </Button>
        <p className="text-muted-foreground">載入中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href={ROUTES.STOCKS}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回標的列表
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
                <Badge variant="outline">文章數: {stock.postCount}</Badge>
                <Badge
                  variant="default"
                  className={stock.winRate != null && stock.winRate >= 0.6 ? 'bg-green-600' : ''}
                >
                  30日勝率: {stock.winRate != null ? `${(stock.winRate * 100).toFixed(0)}%` : '—'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="chart">Chart</TabsTrigger>
          <TabsTrigger value="arguments">Arguments</TabsTrigger>
        </TabsList>

        {/* Posts Tab */}
        <TabsContent value="posts" className="space-y-4">
          <h2 className="text-lg font-semibold">相關文章</h2>
          {postsLoading && <p className="text-muted-foreground">載入文章...</p>}
          {!postsLoading && posts.length === 0 && (
            <p className="text-muted-foreground">尚無相關文章</p>
          )}
          {!postsLoading &&
            posts.map((post) => {
              const currentStock = post.stocks.find((s) => s.ticker === decodedTicker);
              const changes =
                currentStock && post.priceChanges ? post.priceChanges[currentStock.id] : null;
              return (
                <Link key={post.id} href={ROUTES.POST_DETAIL(post.id)}>
                  <Card className="hover:bg-muted/50 transition-colors">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-4">
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
                              className="font-medium hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {post.kol.name}
                            </Link>
                            <Badge variant="outline" className={SENTIMENT_COLORS[post.sentiment]}>
                              {SENTIMENT_LABELS[post.sentiment]}
                            </Badge>
                            <span className="text-muted-foreground text-sm">
                              {formatDateTime(post.postedAt)}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                            {post.content}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-4 text-sm">
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
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>勝率統計</CardTitle>
              <CardDescription>KOL 對此標的的預測勝率（依不同時間週期計算）</CardDescription>
            </CardHeader>
            <CardContent>
              {winRateLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                  <span className="text-muted-foreground ml-2">計算勝率中...</span>
                </div>
              ) : winRateStats ? (
                <div className="space-y-6">
                  {/* 整體統計 */}
                  <div className="bg-muted/30 rounded-lg border p-4 text-center">
                    <p className="text-muted-foreground text-sm">整體平均勝率</p>
                    <p
                      className={`mt-1 text-4xl font-bold ${getWinRateColorClass(winRateStats.overall.avgWinRate)}`}
                    >
                      {formatWinRate(winRateStats.overall.avgWinRate)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      共 {winRateStats.overall.total} 篇有方向性文章
                    </p>
                  </div>

                  {/* 各期間統計 */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { key: 'day5', label: '5日', data: winRateStats.day5 },
                      { key: 'day30', label: '30日', data: winRateStats.day30 },
                      { key: 'day90', label: '90日', data: winRateStats.day90 },
                      { key: 'day365', label: '365日', data: winRateStats.day365 },
                    ].map((item) => (
                      <div key={item.key} className="rounded-lg border p-4 text-center">
                        <p className="text-muted-foreground text-sm">{item.label}勝率</p>
                        <p
                          className={`mt-1 text-3xl font-bold ${getWinRateColorClass(item.data.rate)}`}
                        >
                          {formatWinRate(item.data.rate)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {item.data.wins}勝 / {item.data.losses}敗
                        </p>
                        <p className="text-muted-foreground text-xs">
                          ({item.data.total} 筆有效樣本)
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* 說明 */}
                  <div className="rounded-lg border border-dashed p-4">
                    <h4 className="text-sm font-medium">勝率計算說明</h4>
                    <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                      <li>• 看多文章：發文後股價上漲即為勝利</li>
                      <li>• 看空文章：發文後股價下跌即為勝利</li>
                      <li>• 中立文章不納入勝率計算</li>
                      <li>• 計算基於所有 KOL 對此標的的文章</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center">無法載入勝率資料</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chart Tab */}
        <TabsContent value="chart" className="space-y-4">
          <StockChartTab ticker={ticker} />
        </TabsContent>

        {/* Arguments Tab */}
        <TabsContent value="arguments" className="space-y-4">
          <StockArgumentsTab ticker={decodedTicker} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
