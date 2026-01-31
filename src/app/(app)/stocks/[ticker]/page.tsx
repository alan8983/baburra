'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ROUTES } from '@/lib/constants';
import { SENTIMENT_LABELS, SENTIMENT_COLORS } from '@/domain/models/post';

// 模擬資料
const mockStock = {
  id: '1',
  ticker: 'AAPL',
  name: 'Apple Inc.',
  logoUrl: null,
  market: 'US',
  postCount: 128,
  winRate: 0.68,
};

const mockPosts = [
  {
    id: '1',
    kol: { id: '1', name: '股癌', avatarUrl: null },
    sentiment: 1 as const,
    postedAt: '2026/01/30 14:30',
    priceChange5d: 5.2,
    priceChange30d: 8.1,
    content: 'Apple 第四季財報表現優異，AI 功能推動 iPhone 銷量成長...',
  },
  {
    id: '2',
    kol: { id: '2', name: '財報狗', avatarUrl: null },
    sentiment: 2 as const,
    postedAt: '2026/01/28 10:15',
    priceChange5d: 3.8,
    priceChange30d: 12.3,
    content: '蘋果服務營收持續創新高，訂閱用戶突破 10 億...',
  },
  {
    id: '3',
    kol: { id: '3', name: '艾蜜莉', avatarUrl: null },
    sentiment: 0 as const,
    postedAt: '2026/01/25 16:45',
    priceChange5d: -1.2,
    priceChange30d: 5.6,
    content: '目前估值合理，建議等待更好的進場點...',
  },
  {
    id: '4',
    kol: { id: '1', name: '股癌', avatarUrl: null },
    sentiment: 1 as const,
    postedAt: '2026/01/20 09:00',
    priceChange5d: 2.5,
    priceChange30d: 15.8,
    content: 'Vision Pro 開賣，雖然銷量未爆發，但長期看好 AR/VR 布局...',
  },
];

const winRateStats = [
  { period: '5日', rate: 0.65, total: 128 },
  { period: '30日', rate: 0.68, total: 120 },
  { period: '90日', rate: 0.62, total: 98 },
  { period: '365日', rate: 0.58, total: 65 },
];

export default function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const stock = mockStock;

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
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 text-2xl font-bold text-primary">
              {stock.ticker.slice(0, 2)}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <h1 className="text-2xl font-bold">{stock.ticker}</h1>
                <Badge variant="outline">{stock.market}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">{stock.name}</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4 sm:justify-start">
                <Badge variant="outline">
                  文章數: {stock.postCount}
                </Badge>
                <Badge
                  variant="default"
                  className={stock.winRate >= 0.6 ? 'bg-green-600' : ''}
                >
                  30日勝率: {(stock.winRate * 100).toFixed(0)}%
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
          <TabsTrigger value="chart">Chart</TabsTrigger>
          <TabsTrigger value="arguments">Arguments</TabsTrigger>
        </TabsList>

        {/* Posts Tab */}
        <TabsContent value="posts" className="space-y-4">
          <h2 className="text-lg font-semibold">相關文章</h2>
          {mockPosts.map((post) => (
            <Card key={post.id}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={post.kol.avatarUrl || undefined} />
                    <AvatarFallback>
                      <User className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={ROUTES.KOL_DETAIL(post.kol.id)}
                        className="font-medium hover:underline"
                      >
                        {post.kol.name}
                      </Link>
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
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {post.content}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm">
                      <span
                        className={
                          post.priceChange5d >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                        }
                      >
                        5日: {post.priceChange5d >= 0 ? '+' : ''}
                        {post.priceChange5d.toFixed(1)}%
                      </span>
                      <span
                        className={
                          post.priceChange30d >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                        }
                      >
                        30日: {post.priceChange30d >= 0 ? '+' : ''}
                        {post.priceChange30d.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Chart Tab */}
        <TabsContent value="chart" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>K 線圖</CardTitle>
              <CardDescription>
                股價走勢圖與 KOL 觀點標記
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
                <p className="text-muted-foreground">
                  K 線圖元件將在 Phase 6 實作
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Win Rate Stats */}
          <Card>
            <CardHeader>
              <CardTitle>勝率統計</CardTitle>
              <CardDescription>
                KOL 對此標的的預測勝率
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
                      ({stat.total} 篇文章)
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Arguments Tab */}
        <TabsContent value="arguments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>論點彙整</CardTitle>
              <CardDescription>
                KOL 對此標的的論點分析（Phase 8 實作）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed">
                <p className="text-muted-foreground">
                  論點彙整功能將在 Phase 8 實作
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
