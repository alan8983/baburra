'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/utils/date';
import { SENTIMENT_LABELS, SENTIMENT_COLORS } from '@/domain/models/post';
import { useKol, useKolPosts, useKolWinRate } from '@/hooks';
import { formatWinRate, getWinRateColorClass } from '@/domain/calculators';

export default function KolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const { data: kol, isLoading: kolLoading, error: kolError } = useKol(id);
  const { data: postsData, isLoading: postsLoading } = useKolPosts(id);
  const { data: winRateStats, isLoading: winRateLoading } = useKolWinRate(id);

  const postsByStock = useMemo(() => {
    const list = postsData?.data ?? [];
    const map = new Map<
      string,
      {
        stockId: string;
        ticker: string;
        name: string;
        posts: Array<{ id: string; sentiment: number; postedAt: Date; priceChange: number | null }>;
      }
    >();
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
        const entry = map.get(stock.id)!;
        const change = priceChanges[stock.id]?.day5 ?? null;
        entry.posts.push({
          id: post.id,
          sentiment: post.sentiment,
          postedAt: post.postedAt,
          priceChange: change,
        });
      }
    }
    return Array.from(map.values());
  }, [postsData?.data]);

  if (kolError || (!kolLoading && !kol)) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.KOLS}>返回 KOL 列表</Link>
        </Button>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">無法載入 KOL 或找不到該 KOL</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (kolLoading || !kol) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.KOLS}>返回 KOL 列表</Link>
        </Button>
        <p className="text-muted-foreground">載入中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href={ROUTES.KOLS}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回 KOL 列表
        </Link>
      </Button>

      {/* KOL Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Avatar className="h-20 w-20">
              <AvatarImage src={kol.avatarUrl || undefined} />
              <AvatarFallback>
                <User className="h-10 w-10" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl font-bold">{kol.name}</h1>
              {kol.bio && <p className="text-muted-foreground mt-1">{kol.bio}</p>}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4 sm:justify-start">
                <Badge variant="outline">文章數: {kol.postCount}</Badge>
                <Badge
                  variant="default"
                  className={kol.winRate != null && kol.winRate >= 0.6 ? 'bg-green-600' : ''}
                >
                  總體勝率: {kol.winRate != null ? `${(kol.winRate * 100).toFixed(0)}%` : '—'}
                </Badge>
              </div>
              {/* Social Links */}
              {Object.entries(kol.socialLinks).length > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <h2 className="text-lg font-semibold">依標的分組的文章</h2>
          {postsLoading && <p className="text-muted-foreground">載入文章...</p>}
          {!postsLoading && postsByStock.length === 0 && (
            <p className="text-muted-foreground">尚無文章</p>
          )}
          {!postsLoading &&
            postsByStock.map((stock) => (
              <Card key={stock.stockId}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {stock.ticker} - {stock.name}
                      </CardTitle>
                      <CardDescription>共 {stock.posts.length} 篇文章</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {stock.posts.slice(0, 5).map((post) => (
                    <div
                      key={post.id}
                      className="hover:bg-muted/50 flex cursor-pointer items-center justify-between rounded-lg border p-3"
                      onClick={() => router.push(ROUTES.POST_DETAIL(post.id))}
                    >
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className={
                            SENTIMENT_COLORS[post.sentiment as keyof typeof SENTIMENT_COLORS]
                          }
                        >
                          {SENTIMENT_LABELS[post.sentiment as keyof typeof SENTIMENT_LABELS]}
                        </Badge>
                        <span className="text-muted-foreground text-sm">
                          {formatDate(post.postedAt)}
                        </span>
                      </div>
                      <span
                        className={`text-sm font-medium ${
                          post.priceChange == null
                            ? 'text-muted-foreground'
                            : post.priceChange >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                        }`}
                      >
                        {post.priceChange != null
                          ? `${post.priceChange >= 0 ? '+' : ''}${post.priceChange.toFixed(1)}% (5日)`
                          : '—'}
                      </span>
                    </div>
                  ))}
                  {stock.posts.length > 5 && (
                    <Button variant="ghost" size="sm" className="w-full" asChild>
                      <Link href={ROUTES.STOCK_DETAIL(stock.ticker)}>
                        查看全部 {stock.posts.length} 篇
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>勝率統計</CardTitle>
              <CardDescription>依不同時間週期計算的預測勝率</CardDescription>
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
                      <li>• 每篇文章對應的每個標的分別計算</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center">無法載入勝率資料</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* About Tab */}
        <TabsContent value="about" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>關於 {kol.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-medium">簡介</h3>
                <p className="text-muted-foreground mt-1">{kol.bio || '尚無簡介'}</p>
              </div>
              <Separator />
              <div>
                <h3 className="font-medium">社群連結</h3>
                {Object.entries(kol.socialLinks).length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {Object.entries(kol.socialLinks).map(([platform, url]) => (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary flex items-center gap-2 text-sm hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {platform}: {url}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-1">尚無社群連結</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
