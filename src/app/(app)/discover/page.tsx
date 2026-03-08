'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, Newspaper } from 'lucide-react';
import { useTrendingStocks, usePopularKols } from '@/hooks';
import { useDashboard } from '@/hooks/use-dashboard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ROUTES } from '@/lib/constants';

function formatNumber(num: number, locale: string): string {
  return num.toLocaleString(locale);
}

export default function DiscoverPage() {
  const t = useTranslations('discover');
  const locale = useLocale();
  const { data: trendingStocks, isLoading: loadingStocks } = useTrendingStocks(7, 10);
  const { data: popularKols, isLoading: loadingKols } = usePopularKols(10);
  const { data: dashboard, isLoading: loadingDashboard } = useDashboard();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Community Activity Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('communityActivity.postsThisWeek')}
            </CardTitle>
            <Newspaper className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            {loadingDashboard ? (
              <div className="bg-muted h-8 w-16 animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">
                {formatNumber(dashboard?.stats.postWeeklyNew ?? 0, locale)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('communityActivity.totalKols')}
            </CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            {loadingDashboard ? (
              <div className="bg-muted h-8 w-16 animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">
                {formatNumber(dashboard?.stats.kolCount ?? 0, locale)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('communityActivity.totalStocks')}
            </CardTitle>
            <TrendingUp className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            {loadingDashboard ? (
              <div className="bg-muted h-8 w-16 animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">
                {formatNumber(dashboard?.stats.stockCount ?? 0, locale)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trending Stocks Top 10 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('trendingStocks.title')}</CardTitle>
          <CardDescription>{t('trendingStocks.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStocks ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-muted h-10 animate-pulse rounded" />
              ))}
            </div>
          ) : !trendingStocks || trendingStocks.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">{t('trendingStocks.noData')}</p>
          ) : (
            <div className="space-y-1">
              {trendingStocks.map((stock, i) => (
                <Link
                  key={stock.stockId}
                  href={ROUTES.STOCK_DETAIL(stock.ticker)}
                  className="hover:bg-muted flex items-center justify-between rounded-lg border-b px-2 py-3 transition-colors last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-primary/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-primary text-sm font-medium">{stock.ticker}</p>
                      <p className="text-muted-foreground text-xs">{stock.name}</p>
                    </div>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {t('trendingStocks.posts', { count: stock.postCount })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Popular KOLs Top 10 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('popularKols.title')}</CardTitle>
          <CardDescription>{t('popularKols.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingKols ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-muted h-12 animate-pulse rounded" />
              ))}
            </div>
          ) : !popularKols || popularKols.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">{t('popularKols.noData')}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {popularKols.map((kol, i) => (
                <Link
                  key={kol.kolId}
                  href={ROUTES.KOL_DETAIL(kol.kolId)}
                  className="hover:bg-muted flex items-center gap-3 rounded-lg border p-4 transition-colors"
                >
                  <span className="bg-primary/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium">
                    {i + 1}
                  </span>
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={kol.avatarUrl || undefined} />
                    <AvatarFallback>
                      <Users className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{kol.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {t('popularKols.followerCount', { count: kol.followerCount })}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
