'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, Users, TrendingUp, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { useKols } from '@/hooks/use-kols';
import { useStocks } from '@/hooks/use-stocks';

const TOP_N = 3;

function sortByCreatedAtDesc<T extends { createdAt: Date | string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
}

function SkeletonChips() {
  return (
    <div className="flex flex-wrap gap-2" data-testid="quick-nav-skeleton">
      <div className="bg-muted h-6 w-16 animate-pulse rounded-full" />
      <div className="bg-muted h-6 w-20 animate-pulse rounded-full" />
      <div className="bg-muted h-6 w-14 animate-pulse rounded-full" />
    </div>
  );
}

export function InputPageQuickNav() {
  const t = useTranslations('input.quickNav');
  const kolsQuery = useKols();
  const stocksQuery = useStocks();

  const recentKols = useMemo(() => {
    const data = kolsQuery.data?.data ?? [];
    return sortByCreatedAtDesc(data).slice(0, TOP_N);
  }, [kolsQuery.data]);

  const recentStocks = useMemo(() => {
    const data = stocksQuery.data?.data ?? [];
    return sortByCreatedAtDesc(data).slice(0, TOP_N);
  }, [stocksQuery.data]);

  return (
    <div className="space-y-4" data-testid="input-quick-nav">
      {/* Dashboard nav card */}
      <Link
        href={ROUTES.DASHBOARD}
        className="group focus-visible:ring-ring block rounded-lg focus-visible:ring-2 focus-visible:outline-none"
      >
        <Card className="group-hover:border-primary/50 transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <LayoutDashboard className="text-primary h-4 w-4" />
                {t('dashboard.title')}
              </span>
              <ArrowRight className="text-muted-foreground h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-muted-foreground text-sm">{t('dashboard.description')}</p>
          </CardContent>
        </Card>
      </Link>

      {/* KOLs nav card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Link
              href={ROUTES.KOLS}
              className="group focus-visible:ring-ring flex items-center justify-between rounded focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="flex items-center gap-2">
                <Users className="text-primary h-4 w-4" />
                {t('kols.title')}
              </span>
              <ArrowRight className="text-muted-foreground h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-muted-foreground text-sm">{t('kols.description')}</p>
          {kolsQuery.isLoading ? (
            <SkeletonChips />
          ) : recentKols.length === 0 ? (
            <p className="text-muted-foreground text-xs italic">{t('kols.empty')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recentKols.map((kol) => (
                <Link
                  key={kol.id}
                  href={ROUTES.KOL_DETAIL(kol.id)}
                  className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Badge
                    variant="secondary"
                    className="hover:bg-primary hover:text-primary-foreground max-w-[140px] cursor-pointer truncate transition-colors"
                  >
                    {kol.name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stocks nav card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Link
              href={ROUTES.STOCKS}
              className="group focus-visible:ring-ring flex items-center justify-between rounded focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="flex items-center gap-2">
                <TrendingUp className="text-primary h-4 w-4" />
                {t('stocks.title')}
              </span>
              <ArrowRight className="text-muted-foreground h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-muted-foreground text-sm">{t('stocks.description')}</p>
          {stocksQuery.isLoading ? (
            <SkeletonChips />
          ) : recentStocks.length === 0 ? (
            <p className="text-muted-foreground text-xs italic">{t('stocks.empty')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recentStocks.map((stock) => (
                <Link
                  key={stock.id}
                  href={ROUTES.STOCK_DETAIL(stock.ticker)}
                  className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Badge
                    variant="secondary"
                    className="hover:bg-primary hover:text-primary-foreground cursor-pointer font-mono transition-colors"
                  >
                    {stock.ticker}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
