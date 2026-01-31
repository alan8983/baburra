'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';

// 模擬資料
const mockStocks = [
  {
    id: '1',
    ticker: 'AAPL',
    name: 'Apple Inc.',
    logoUrl: null,
    market: 'US',
    postCount: 128,
    winRate: 0.68,
    lastPostAt: '2026-01-30',
  },
  {
    id: '2',
    ticker: 'TSLA',
    name: 'Tesla Inc.',
    logoUrl: null,
    market: 'US',
    postCount: 95,
    winRate: 0.55,
    lastPostAt: '2026-01-29',
  },
  {
    id: '3',
    ticker: 'NVDA',
    name: 'NVIDIA Corp.',
    logoUrl: null,
    market: 'US',
    postCount: 156,
    winRate: 0.72,
    lastPostAt: '2026-01-30',
  },
  {
    id: '4',
    ticker: 'MSFT',
    name: 'Microsoft Corp.',
    logoUrl: null,
    market: 'US',
    postCount: 84,
    winRate: 0.62,
    lastPostAt: '2026-01-28',
  },
  {
    id: '5',
    ticker: 'AMZN',
    name: 'Amazon.com Inc.',
    logoUrl: null,
    market: 'US',
    postCount: 72,
    winRate: 0.58,
    lastPostAt: '2026-01-27',
  },
  {
    id: '6',
    ticker: 'GOOGL',
    name: 'Alphabet Inc.',
    logoUrl: null,
    market: 'US',
    postCount: 68,
    winRate: 0.64,
    lastPostAt: '2026-01-26',
  },
];

export default function StocksPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStocks = mockStocks.filter(
    (stock) =>
      stock.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stock.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">投資標的</h1>
          <p className="text-muted-foreground">
            瀏覽所有被追蹤的投資標的
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          新增標的
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜尋股票代碼或名稱..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stock Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredStocks.map((stock) => (
          <Link key={stock.id} href={ROUTES.STOCK_DETAIL(stock.ticker)}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{stock.ticker}</CardTitle>
                    <CardDescription className="text-xs truncate">
                      {stock.name}
                    </CardDescription>
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
                      variant={stock.winRate >= 0.6 ? 'default' : 'secondary'}
                      className={stock.winRate >= 0.6 ? 'bg-green-600' : ''}
                    >
                      {(stock.winRate * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">最近發文</span>
                    <span className="text-xs">{stock.lastPostAt}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Empty State */}
      {filteredStocks.length === 0 && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <TrendingUp className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">找不到標的</h3>
            <p className="mt-2 text-sm text-muted-foreground">
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
