'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/utils/date';
import { useStocks } from '@/hooks';

export default function StocksPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const { data, isLoading, error } = useStocks({ search: searchQuery || undefined });

  const stocks = data?.data ?? [];
  const filteredStocks = stocks;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">投資標的</h1>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">無法載入標的列表，請稍後再試。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">投資標的</h1>
          <p className="text-muted-foreground">瀏覽所有被追蹤的投資標的</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          新增標的
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
        <Input
          placeholder="搜尋股票代碼或名稱..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <Card className="py-12">
          <CardContent className="text-muted-foreground flex justify-center">載入中...</CardContent>
        </Card>
      )}

      {/* Stock Grid */}
      {!isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredStocks.map((stock) => (
            <Card
              key={stock.id}
              className="hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => router.push(ROUTES.STOCK_DETAIL(stock.ticker))}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{stock.ticker}</CardTitle>
                    <CardDescription className="truncate text-xs">{stock.name}</CardDescription>
                  </div>
                  <Badge variant="outline">{stock.market}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">文章數</span>
                    <span className="font-medium">{stock.postCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">30日勝率</span>
                    <Badge
                      variant={
                        stock.winRate != null && stock.winRate >= 0.6 ? 'default' : 'secondary'
                      }
                      className={
                        stock.winRate != null && stock.winRate >= 0.6 ? 'bg-green-600' : ''
                      }
                    >
                      {stock.winRate != null ? `${(stock.winRate * 100).toFixed(0)}%` : '—'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">最近發文</span>
                    <span className="text-xs">
                      {stock.lastPostAt ? formatDate(stock.lastPostAt) : '—'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredStocks.length === 0 && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <TrendingUp className="text-muted-foreground h-12 w-12" />
            <h3 className="mt-4 text-lg font-semibold">找不到標的</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              {searchQuery
                ? `沒有符合「${searchQuery}」的投資標的`
                : '還沒有任何投資標的，點擊上方按鈕新增'}
            </p>
            {!searchQuery && (
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                新增標的
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
