'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, FileText, Newspaper, BarChart3 } from 'lucide-react';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { useDashboard } from '@/hooks/use-dashboard';
import { useTrendingStocks, usePopularKols } from '@/hooks';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { EmptyState } from '@/components/shared/empty-state';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { ROUTES } from '@/lib/constants';
import { PortfolioPulse } from './_components/portfolio-pulse';
import { HotTakesFeed } from './_components/hot-takes-feed';
import { StockMovers } from './_components/stock-movers';
import { KolLeaderboard } from './_components/kol-leaderboard';
import { getStaggerClass } from '@/lib/animations';

// 格式化數字（千分位）- 使用動態語系
function formatNumber(num: number, locale: string): string {
  return num.toLocaleString(locale);
}

// 格式化日期 - 使用動態語系
function formatDate(date: Date | string, locale: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// 格式化相對時間（用於草稿最近更新）
function formatRelativeTime(
  date: Date | string,
  t: (key: string, values?: Record<string, string | number | Date>) => string
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('time.justNow');
  if (diffMins < 60) return t('time.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('time.daysAgo', { count: diffDays });
  return formatDate(d, 'zh-TW');
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { colors } = useColorPalette();
  const { data, isLoading, error } = useDashboard();
  const { data: trendingStocks } = useTrendingStocks(7, 5);
  const { data: popularKols } = usePopularKols(5);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="bg-muted h-4 w-24 animate-pulse rounded" />
                <div className="bg-muted h-4 w-4 animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="bg-muted mb-2 h-8 w-16 animate-pulse rounded" />
                <div className="bg-muted h-4 w-32 animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive text-center">
              {t('errors.loadError', {
                error: error instanceof Error ? error.message : t('errors.unknownError'),
              })}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { stats, recentPosts, topKols } = data;

  const isEmpty =
    stats.kolCount === 0 &&
    stats.stockCount === 0 &&
    stats.postCount === 0 &&
    stats.draftCount === 0;

  if (isEmpty) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
            <p className="text-muted-foreground">{t('description')}</p>
          </div>
          <LocaleSwitcher />
        </div>
        <EmptyState
          icon={<BarChart3 className="h-12 w-12" />}
          title={t('empty.title')}
          description={t('empty.description')}
          primaryAction={{ label: t('empty.importKol'), href: ROUTES.INPUT }}
          secondaryAction={{ label: t('empty.addPost'), href: ROUTES.INPUT }}
        />
      </div>
    );
  }

  // 統計卡片資料
  const statsCards = [
    {
      title: t('stats.kolTotal'),
      value: stats.kolCount,
      description:
        stats.kolMonthlyNew > 0
          ? t('stats.kolMonthlyNew', { count: formatNumber(stats.kolMonthlyNew, locale) })
          : t('stats.kolMonthlyNoNew'),
      icon: Users,
    },
    {
      title: t('stats.stocks'),
      value: stats.stockCount,
      description:
        stats.stockMonthlyNew > 0
          ? t('stats.stocksMonthlyNew', { count: formatNumber(stats.stockMonthlyNew, locale) })
          : t('stats.stocksMonthlyNoNew'),
      icon: TrendingUp,
    },
    {
      title: t('stats.posts'),
      value: stats.postCount,
      description:
        stats.postWeeklyNew > 0
          ? t('stats.postsWeeklyNew', { count: formatNumber(stats.postWeeklyNew, locale) })
          : t('stats.postsWeeklyNoNew'),
      icon: Newspaper,
    },
    {
      title: t('stats.drafts'),
      value: stats.draftCount,
      description: stats.draftLastUpdated
        ? `${t('drafts.recentUpdate')}: ${formatRelativeTime(stats.draftLastUpdated, tCommon)}`
        : t('drafts.noDrafts'),
      icon: FileText,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <LocaleSwitcher />
      </div>

      {/* Portfolio Pulse */}
      <PortfolioPulse posts={recentPosts} />

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, i) => (
          <Card key={stat.title} className={getStaggerClass(i)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <AnimatedNumber
                  value={stat.value}
                  formatter={(v, l) => v.toLocaleString(l)}
                  locale={locale}
                />
              </div>
              <p className="text-muted-foreground text-xs">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Insights Grid: Hot Takes + Stock Movers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <HotTakesFeed posts={recentPosts} />
        <StockMovers posts={recentPosts} />
      </div>

      {/* Leaderboard + Community */}
      <div className="grid gap-6 lg:grid-cols-2">
        <KolLeaderboard posts={recentPosts} />

        {/* Community Insights: Trending Stocks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t('insights.trendingStocks.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!trendingStocks || trendingStocks.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                {t('insights.trendingStocks.noData')}
              </p>
            ) : (
              <div className="space-y-1">
                {trendingStocks.map((stock, i) => (
                  <Link
                    key={stock.stockId}
                    href={ROUTES.STOCK_DETAIL(stock.ticker)}
                    className={`hover:bg-muted flex items-center justify-between rounded-lg px-2 py-2.5 transition-colors ${getStaggerClass(i)}`}
                  >
                    <div className="flex items-center gap-3">
                      <TrendingUp className="text-muted-foreground h-4 w-4" />
                      <div>
                        <p className="text-sm font-medium">{stock.ticker}</p>
                        <p className="text-muted-foreground text-xs">{stock.name}</p>
                      </div>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {t('insights.trendingStocks.postCount', { count: stock.postCount })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('quickActions.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/input"
              className="hover:bg-muted flex items-center gap-3 rounded-lg border p-4 transition-colors"
            >
              <FileText className="text-primary h-8 w-8" />
              <div>
                <p className="font-medium">{t('quickActions.quickInput')}</p>
                <p className="text-muted-foreground text-sm">{t('quickActions.quickInputDesc')}</p>
              </div>
            </Link>
            <Link
              href="/kols"
              className="hover:bg-muted flex items-center gap-3 rounded-lg border p-4 transition-colors"
            >
              <Users className="text-primary h-8 w-8" />
              <div>
                <p className="font-medium">{t('quickActions.kolManagement')}</p>
                <p className="text-muted-foreground text-sm">
                  {t('quickActions.kolManagementDesc')}
                </p>
              </div>
            </Link>
            <Link
              href="/stocks"
              className="hover:bg-muted flex items-center gap-3 rounded-lg border p-4 transition-colors"
            >
              <TrendingUp className="text-primary h-8 w-8" />
              <div>
                <p className="font-medium">{t('quickActions.stocks')}</p>
                <p className="text-muted-foreground text-sm">{t('quickActions.stocksDesc')}</p>
              </div>
            </Link>
            <Link
              href="/posts"
              className="hover:bg-muted flex items-center gap-3 rounded-lg border p-4 transition-colors"
            >
              <Newspaper className="text-primary h-8 w-8" />
              <div>
                <p className="font-medium">{t('quickActions.allPosts')}</p>
                <p className="text-muted-foreground text-sm">{t('quickActions.allPostsDesc')}</p>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
