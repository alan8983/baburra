'use client';

import { use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Bookmark, ExternalLink, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ROUTES } from '@/lib/constants';
import { SENTIMENT_LABELS, SENTIMENT_COLORS } from '@/domain/models/post';

// 模擬文章資料
const mockPost = {
  id: '1',
  kol: { id: '1', name: '股癌', avatarUrl: null },
  stocks: [
    { id: '1', ticker: 'AAPL', name: 'Apple Inc.' },
    { id: '2', ticker: 'TSLA', name: 'Tesla Inc.' },
  ],
  sentiment: 1 as const,
  sentimentAiGenerated: true,
  postedAt: '2026/01/30 14:30',
  sourceUrl: 'https://twitter.com/example/status/123456',
  sourcePlatform: 'twitter',
  content: `蘋果和特斯拉最新財報分析：

【蘋果 AAPL】
1. 營收 1197 億美元，年增 8%
2. iPhone 營收持續成長，AI 功能帶動換機潮
3. 服務營收 248 億美元，創歷史新高
4. 本益比 32 倍，略高於歷史平均

【特斯拉 TSLA】
1. 營收 233 億美元，年增 25%
2. 毛利率 17.2%，受價格戰影響
3. FSD 授權營收快速成長
4. 4680 電池量產進度良好

整體評估：兩家公司都展現出強勁的成長動能，蘋果的服務生態系和特斯拉的 FSD 都是長期看好的關鍵。建議逢低佈局。`,
  images: [] as string[],
  priceChanges: {
    AAPL: { day5: 5.2, day30: 8.1, day90: 12.5, day365: 25.3 },
    TSLA: { day5: 3.1, day30: 2.3, day90: -5.2, day365: 45.8 },
  } as Record<string, { day5: number; day30: number; day90: number; day365: number }>,
};

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const post = mockPost;

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
        <Button variant="outline" size="sm">
          <Bookmark className="mr-2 h-4 w-4" />
          加入書籤
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
              <Link
                href={ROUTES.KOL_DETAIL(post.kol.id)}
                className="font-medium hover:underline"
              >
                {post.kol.name}
              </Link>
              <p className="text-sm text-muted-foreground">{post.postedAt}</p>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Stocks & Price Changes */}
          <div className="space-y-3">
            {post.stocks.map((stock) => {
              const changes = post.priceChanges[stock.ticker];
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
                    <span className="text-sm text-muted-foreground">
                      {stock.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={SENTIMENT_COLORS[post.sentiment]}
                    >
                      {SENTIMENT_LABELS[post.sentiment]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span
                      className={
                        changes.day5 >= 0 ? 'text-green-600' : 'text-red-600'
                      }
                    >
                      5日: {changes.day5 >= 0 ? '+' : ''}
                      {changes.day5.toFixed(1)}%
                    </span>
                    <span
                      className={
                        changes.day30 >= 0 ? 'text-green-600' : 'text-red-600'
                      }
                    >
                      30日: {changes.day30 >= 0 ? '+' : ''}
                      {changes.day30.toFixed(1)}%
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
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
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
                <Badge
                  variant="outline"
                  className={SENTIMENT_COLORS[post.sentiment]}
                >
                  {SENTIMENT_LABELS[post.sentiment]}
                </Badge>
                {post.sentimentAiGenerated && (
                  <span className="text-xs text-muted-foreground">
                    (AI 分析)
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="prose prose-sm max-w-none dark:prose-invert">
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
                    <div
                      key={i}
                      className="relative aspect-video overflow-hidden rounded-lg"
                    >
                      <Image
                        src={img}
                        alt={`圖片 ${i + 1}`}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chart Tab */}
        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle>K 線圖</CardTitle>
              <CardDescription>
                股價走勢圖與發文時間標記
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
