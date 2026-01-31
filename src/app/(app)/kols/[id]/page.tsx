'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ROUTES } from '@/lib/constants';
import { SENTIMENT_LABELS, SENTIMENT_COLORS } from '@/domain/models/post';

// 模擬資料
const mockKol = {
  id: '1',
  name: '股癌',
  avatarUrl: null,
  bio: '專注美股分析，分享投資心得與市場觀察。',
  socialLinks: {
    twitter: 'https://twitter.com/example',
    youtube: 'https://youtube.com/example',
  },
  postCount: 42,
  winRate: 0.65,
};

const mockPostsByStock = [
  {
    stockId: '1',
    ticker: 'AAPL',
    name: 'Apple Inc.',
    winRate: 0.7,
    posts: [
      { id: '1', sentiment: 1 as const, postedAt: '2026/01/30', priceChange: 5.2 },
      { id: '2', sentiment: 2 as const, postedAt: '2026/01/15', priceChange: 12.3 },
    ],
    totalPosts: 8,
  },
  {
    stockId: '2',
    ticker: 'TSLA',
    name: 'Tesla Inc.',
    winRate: 0.55,
    posts: [
      { id: '3', sentiment: -1 as const, postedAt: '2026/01/28', priceChange: -3.1 },
    ],
    totalPosts: 5,
  },
  {
    stockId: '3',
    ticker: 'NVDA',
    name: 'NVIDIA Corp.',
    winRate: 0.8,
    posts: [
      { id: '4', sentiment: 2 as const, postedAt: '2026/01/25', priceChange: 15.8 },
    ],
    totalPosts: 10,
  },
];

const winRateStats = [
  { period: '5日', rate: 0.62, total: 42 },
  { period: '30日', rate: 0.65, total: 40 },
  { period: '90日', rate: 0.58, total: 35 },
  { period: '365日', rate: 0.55, total: 28 },
];

export default function KolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const kol = mockKol;

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
              {kol.bio && (
                <p className="mt-1 text-muted-foreground">{kol.bio}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4 sm:justify-start">
                <Badge variant="outline">
                  文章數: {kol.postCount}
                </Badge>
                <Badge
                  variant="default"
                  className={kol.winRate >= 0.6 ? 'bg-green-600' : ''}
                >
                  總體勝率: {(kol.winRate * 100).toFixed(0)}%
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
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
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
          {mockPostsByStock.map((stock) => (
            <Card key={stock.stockId}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {stock.ticker} - {stock.name}
                    </CardTitle>
                    <CardDescription>
                      共 {stock.totalPosts} 篇文章
                    </CardDescription>
                  </div>
                  <Badge
                    variant={stock.winRate >= 0.6 ? 'default' : 'secondary'}
                    className={stock.winRate >= 0.6 ? 'bg-green-600' : ''}
                  >
                    勝率 {(stock.winRate * 100).toFixed(0)}%
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {stock.posts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={SENTIMENT_COLORS[post.sentiment]}
                      >
                        {SENTIMENT_LABELS[post.sentiment]}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {post.postedAt}
                      </span>
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        post.priceChange >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {post.priceChange >= 0 ? '+' : ''}
                      {post.priceChange.toFixed(1)}% (5日)
                    </span>
                  </div>
                ))}
                {stock.totalPosts > stock.posts.length && (
                  <Button variant="ghost" size="sm" className="w-full">
                    查看全部 {stock.totalPosts} 篇
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
              <CardDescription>
                依不同時間週期計算的預測勝率
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {winRateStats.map((stat) => (
                  <div
                    key={stat.period}
                    className="rounded-lg border p-4 text-center"
                  >
                    <p className="text-sm text-muted-foreground">{stat.period}勝率</p>
                    <p className="mt-1 text-3xl font-bold">
                      {(stat.rate * 100).toFixed(0)}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ({stat.total} 篇有效文章)
                    </p>
                  </div>
                ))}
              </div>
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
                <p className="mt-1 text-muted-foreground">
                  {kol.bio || '尚無簡介'}
                </p>
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
                        className="flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {platform}: {url}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">尚無社群連結</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
