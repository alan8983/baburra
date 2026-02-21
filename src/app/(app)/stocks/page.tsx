'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Search, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/utils/date';
import { useStocks } from '@/hooks';
import { EmptyState } from '@/components/shared/empty-state';

export default function StocksPage() {
  const router = useRouter();
  const t = useTranslations('stocks');
  const [searchQuery, setSearchQuery] = useState('');
  const { data, isLoading, error } = useStocks({ search: searchQuery || undefined });

  const stocks = data?.data ?? [];
  const filteredStocks = stocks;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">{t('errors.loadFailed')}</p>
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
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('newStock')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
        <Input
          placeholder={t('search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <Card className="py-12">
          <CardContent className="text-muted-foreground flex justify-center">
            {t('loading')}
          </CardContent>
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
                  </div>
                  <Badge variant="outline">{stock.market}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('stats.postCount')}</span>
                    <span className="font-medium">{stock.postCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('stats.returnRate30d')}</span>
                    <Badge
                      variant={
                        stock.returnRate != null && stock.returnRate >= 0 ? 'default' : 'secondary'
                      }
                      className={
                        stock.returnRate != null && stock.returnRate >= 0 ? 'bg-green-600' : ''
                      }
                    >
                      {stock.returnRate != null
                        ? `${stock.returnRate >= 0 ? '+' : ''}${stock.returnRate.toFixed(1)}%`
                        : '—'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('stats.recentPost')}</span>
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
      {!isLoading &&
        filteredStocks.length === 0 &&
        (searchQuery ? (
          <Card className="py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <TrendingUp className="text-muted-foreground h-12 w-12" />
              <h3 className="mt-4 text-lg font-semibold">{t('empty.noStocks')}</h3>
              <p className="text-muted-foreground mt-2 text-sm">
                {t('empty.noResults', { query: searchQuery })}
              </p>
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={<TrendingUp className="h-12 w-12" />}
            title={t('empty.noStocks')}
            description={t('empty.description')}
            primaryAction={{ label: t('empty.addPost'), href: ROUTES.INPUT }}
          />
        ))}
    </div>
  );
}
