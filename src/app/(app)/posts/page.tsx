'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, User, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ROUTES } from '@/lib/constants';
import { SENTIMENT_LABELS, SENTIMENT_COLORS } from '@/domain/models/post';

// 模擬文章資料
const mockPosts: Array<{
  id: string;
  kol: { id: string; name: string; avatarUrl: string | null };
  stocks: Array<{ ticker: string; name: string }>;
  sentiment: -2 | -1 | 0 | 1 | 2;
  postedAt: string;
  content: string;
  priceChanges: Record<string, number>;
}> = [
  {
    id: '1',
    kol: { id: '1', name: '股癌', avatarUrl: null },
    stocks: [
      { ticker: 'AAPL', name: 'Apple Inc.' },
      { ticker: 'TSLA', name: 'Tesla Inc.' },
    ],
    sentiment: 1,
    postedAt: '2026/01/30 14:30',
    content: '蘋果和特斯拉最新財報分析，兩家公司都展現出強勁的成長動能...',
    priceChanges: { AAPL: 5.2, TSLA: 3.1 },
  },
  {
    id: '2',
    kol: { id: '2', name: '財報狗', avatarUrl: null },
    stocks: [{ ticker: 'NVDA', name: 'NVIDIA Corp.' }],
    sentiment: 2,
    postedAt: '2026/01/29 10:15',
    content: 'NVIDIA 在 AI 領域的領先地位持續鞏固，資料中心營收創新高...',
    priceChanges: { NVDA: 8.5 },
  },
  {
    id: '3',
    kol: { id: '3', name: '艾蜜莉', avatarUrl: null },
    stocks: [{ ticker: 'MSFT', name: 'Microsoft Corp.' }],
    sentiment: 0,
    postedAt: '2026/01/28 16:45',
    content: '微軟 Azure 成長放緩，但 AI 整合帶來新機會，估值合理但不便宜...',
    priceChanges: { MSFT: -1.2 },
  },
  {
    id: '4',
    kol: { id: '1', name: '股癌', avatarUrl: null },
    stocks: [{ ticker: 'META', name: 'Meta Platforms' }],
    sentiment: -1,
    postedAt: '2026/01/27 09:00',
    content: 'Meta 廣告業務面臨挑戰，TikTok 競爭壓力持續，短期保守看待...',
    priceChanges: { META: -4.3 },
  },
  {
    id: '5',
    kol: { id: '4', name: '老王愛說笑', avatarUrl: null },
    stocks: [
      { ticker: 'AMD', name: 'AMD Inc.' },
      { ticker: 'INTC', name: 'Intel Corp.' },
    ],
    sentiment: 1,
    postedAt: '2026/01/26 11:30',
    content: 'AMD 和 Intel 的競爭態勢分析，AMD 在資料中心市場持續搶佔份額...',
    priceChanges: { AMD: 6.2, INTC: -2.1 },
  },
];

export default function PostsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');

  const filteredPosts = mockPosts.filter((post) => {
    const matchesSearch =
      post.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.kol.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.stocks.some(
        (s) =>
          s.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

    const matchesSentiment =
      sentimentFilter === 'all' ||
      post.sentiment.toString() === sentimentFilter;

    return matchesSearch && matchesSentiment;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">所有文章</h1>
        <p className="text-muted-foreground">
          瀏覽所有收錄的 KOL 投資觀點文章
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜尋文章、KOL、標的..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="情緒篩選" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部情緒</SelectItem>
            <SelectItem value="2">強烈看多</SelectItem>
            <SelectItem value="1">看多</SelectItem>
            <SelectItem value="0">中立</SelectItem>
            <SelectItem value="-1">看空</SelectItem>
            <SelectItem value="-2">強烈看空</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Post List */}
      <div className="space-y-4">
        {filteredPosts.map((post) => (
          <Link key={post.id} href={ROUTES.POST_DETAIL(post.id)}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={post.kol.avatarUrl || undefined} />
                    <AvatarFallback>
                      <User className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{post.kol.name}</span>
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

                    {/* Stocks */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {post.stocks.map((stock) => (
                        <div
                          key={stock.ticker}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Badge variant="outline">{stock.ticker}</Badge>
                          <span
                            className={
                              (post.priceChanges[stock.ticker] ?? 0) >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }
                          >
                            {(post.priceChanges[stock.ticker] ?? 0) >= 0 ? '+' : ''}
                            {(post.priceChanges[stock.ticker] ?? 0).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>

                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {post.content}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Empty State */}
      {filteredPosts.length === 0 && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Search className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">找不到文章</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              沒有符合搜尋條件的文章
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
