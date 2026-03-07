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
import { ROUTES } from '@/lib/constants';

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
  return formatDate(d, 'zh-TW'); // Fallback to zh-TW for date format
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { colors } = useColorPalette();
  const { data, isLoading, error } = useDashboard();
  const { data: trendingStocks } = useTrendingStocks(7, 5);
  const { data: popularKols } = usePopularKols(5);

  // Helper to get sentiment label
  const getSentimentLabel = (sentiment: number) => {
    const sentimentMap: Record<number, string> = {
      [-2]: tCommon('sentiment.stronglyBearish'),
      [-1]: tCommon('sentiment.bearish'),
      [0]: tCommon('sentiment.neutral'),
      [1]: tCommon('sentiment.bullish'),
      [2]: tCommon('sentiment.stronglyBullish'),
    };
    return sentimentMap[sentiment] || '';
  };

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
          primaryAction={{ label: t('empty.importKol'), href: ROUTES.IMPORT }}
          secondaryAction={{ label: t('empty.addPost'), href: ROUTES.INPUT }}
        />
      </div>
    );
  }

  // 統計卡片資料
  const statsCards = [
    {
      title: t('stats.kolTotal'),
      value: formatNumber(stats.kolCount, locale),
      description:
        stats.kolMonthlyNew > 0
          ? t('stats.kolMonthlyNew', { count: formatNumber(stats.kolMonthlyNew, locale) })
          : t('stats.kolMonthlyNoNew'),
      icon: Users,
    },
    {
      title: t('stats.stocks'),
      value: formatNumber(stats.stockCount, locale),
      description:
        stats.stockMonthlyNew > 0
          ? t('stats.stocksMonthlyNew', { count: formatNumber(stats.stockMonthlyNew, locale) })
          : t('stats.stocksMonthlyNoNew'),
      icon: TrendingUp,
    },
    {
      title: t('stats.posts'),
      value: formatNumber(stats.postCount, locale),
      description:
        stats.postWeeklyNew > 0
          ? t('stats.postsWeeklyNew', { count: formatNumber(stats.postWeeklyNew, locale) })
          : t('stats.postsWeeklyNoNew'),
      icon: Newspaper,
    },
    {
      title: t('stats.drafts'),
      value: formatNumber(stats.draftCount, locale),
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

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-muted-foreground text-xs">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Posts */}
        <Card>
          <CardHeader>
            <CardTitle>{t('recentPosts.title')}</CardTitle>
            <CardDescription>{t('recentPosts.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {recentPosts.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center">{t('recentPosts.noPosts')}</p>
            ) : (
              <div className="space-y-4">
                {recentPosts.map((post) => {
                  const stockTickers = post.stocks.map((s) => s.ticker).join(', ');
                  const firstStockId = post.stocks[0]?.id;
                  const priceChange =
                    firstStockId && post.priceChanges[firstStockId]
                      ? (post.priceChanges[firstStockId].day30 ??
                        post.priceChanges[firstStockId].day5 ??
                        null)
                      : null;
                  const sentimentColor = colors.sentimentBadgeColors[post.sentiment];

                  return (
                    <Link
                      key={post.id}
                      href={ROUTES.POST_DETAIL(post.id)}
                      className="hover:bg-muted flex items-center justify-between rounded-lg border-b px-2 py-3 transition-colors last:border-0"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{post.kol.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {stockTickers || t('recentPosts.noStocks')} |{' '}
                          {formatDate(post.postedAt, locale)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${sentimentColor}`}
                        >
                          {getSentimentLabel(post.sentiment)}
                        </span>
                        {priceChange !== null && (
                          <span
                            className={`text-sm font-medium ${
                              priceChange >= 0 ? colors.bullish.text : colors.bearish.text
                            }`}
                          >
                            {priceChange >= 0 ? '+' : ''}
                            {priceChange.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top KOLs */}
        <Card>
          <CardHeader>
            <CardTitle>{t('topKols.title')}</CardTitle>
            <CardDescription>{t('topKols.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {topKols.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center">{t('topKols.noKols')}</p>
            ) : (
              <div className="space-y-4">
                {topKols.map((kol, i) => (
                  <Link
                    key={kol.id}
                    href={ROUTES.KOL_DETAIL(kol.id)}
                    className="hover:bg-muted flex items-center justify-between rounded-lg border-b px-2 py-3 transition-colors last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{kol.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {t('topKols.postCount', { count: formatNumber(kol.postCount, locale) })}
                        </p>
                      </div>
                    </div>
                    {kol.lastPostAt && (
                      <div className="text-right">
                        <p className="text-muted-foreground text-xs">
                          {formatDate(kol.lastPostAt, locale)}
                        </p>
                        <p className="text-muted-foreground text-xs">{t('topKols.lastPost')}</p>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Community Insights */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trending Stocks This Week */}
        <Card>
          <CardHeader>
            <CardTitle>{t('insights.trendingStocks.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!trendingStocks || trendingStocks.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center">
                {t('insights.trendingStocks.noData')}
              </p>
            ) : (
              <div className="space-y-4">
                {trendingStocks.map((stock) => (
                  <Link
                    key={stock.stockId}
                    href={ROUTES.STOCK_DETAIL(stock.ticker)}
                    className="hover:bg-muted flex items-center justify-between rounded-lg border-b px-2 py-3 transition-colors last:border-0"
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

        {/* Most Followed KOLs */}
        <Card>
          <CardHeader>
            <CardTitle>{t('insights.popularKols.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!popularKols || popularKols.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center">
                {t('insights.popularKols.noData')}
              </p>
            ) : (
              <div className="space-y-4">
                {popularKols.map((kol) => (
                  <Link
                    key={kol.kolId}
                    href={ROUTES.KOL_DETAIL(kol.kolId)}
                    className="hover:bg-muted flex items-center justify-between rounded-lg border-b px-2 py-3 transition-colors last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={kol.avatarUrl || undefined} />
                        <AvatarFallback>
                          <Users className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-medium">{kol.name}</p>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {t('insights.popularKols.followerCount', { count: kol.followerCount })}
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
          <CardTitle>{t('quickActions.title')}</CardTitle>
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
