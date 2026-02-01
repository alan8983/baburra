'use client';

import { useState, useMemo } from 'react';
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
import { formatDateTime } from '@/lib/utils/date';
import { usePosts } from '@/hooks';

export default function PostsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const { data, isLoading, error } = usePosts({
    search: searchQuery || undefined,
  });

  const posts = data?.data ?? [];
  const filteredPosts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return posts.filter((post) => {
      const matchesSearch =
        !q ||
        post.content.toLowerCase().includes(q) ||
        post.kol.name.toLowerCase().includes(q) ||
        post.stocks.some(
          (s) =>
            s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
        );
      const matchesSentiment =
        sentimentFilter === 'all' || post.sentiment.toString() === sentimentFilter;
      return matchesSearch && matchesSentiment;
    });
  }, [posts, searchQuery, sentimentFilter]);

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">所有文章</h1>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">無法載入文章列表，請稍後再試。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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

      {/* Loading */}
      {isLoading && (
        <Card className="py-12">
          <CardContent className="flex justify-center text-muted-foreground">
            載入中...
          </CardContent>
        </Card>
      )}

      {/* Post List */}
      {!isLoading && (
        <div className="space-y-4">
          {filteredPosts.map((post) => {
            const priceByStockId = post.priceChanges ?? {};
            return (
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
                            {formatDateTime(post.postedAt)}
                          </span>
                        </div>

                        {/* Stocks */}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {post.stocks.map((stock) => {
                            const change = priceByStockId[stock.id]?.day30 ?? null;
                            return (
                              <div
                                key={stock.ticker}
                                className="flex items-center gap-2 text-sm"
                              >
                                <Badge variant="outline">{stock.ticker}</Badge>
                                <span
                                  className={
                                    change == null
                                      ? 'text-muted-foreground'
                                      : change >= 0
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                  }
                                >
                                  {change != null
                                    ? `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`
                                    : '—'}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                          {post.content}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredPosts.length === 0 && (
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
