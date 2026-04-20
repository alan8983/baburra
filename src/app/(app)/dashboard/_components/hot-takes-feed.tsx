'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Flame, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { DASHBOARD_RECENT_POSTS_LIMIT } from '@/lib/constants/dashboard';
import { sentimentKey } from '@/lib/utils/sentiment';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { getStaggerClass } from '@/lib/animations';
import type { PostWithPriceChanges } from '@/domain/models';

interface HotTakesFeedProps {
  posts: PostWithPriceChanges[];
}

export function HotTakesFeed({ posts }: HotTakesFeedProps) {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const { colors } = useColorPalette();

  const recentPosts = useMemo(() => {
    return posts.slice(0, DASHBOARD_RECENT_POSTS_LIMIT);
  }, [posts]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Flame className="h-4 w-4 text-orange-500" />
          {t('hotTakes.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recentPosts.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">{t('hotTakes.noData')}</p>
        ) : (
          <div className="space-y-1">
            {recentPosts.map((post, i) => {
              const firstStock = post.stocks[0];
              const pc = firstStock ? post.priceChanges?.[firstStock.id] : undefined;
              const priceChange = pc?.day5 ?? pc?.day30 ?? null;

              return (
                <Link
                  key={post.id}
                  href={ROUTES.POST_DETAIL(post.id)}
                  className={`hover:bg-muted flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors ${getStaggerClass(i)}`}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={post.kol.avatarUrl || undefined} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{post.kol.name}</span>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-xs ${colors.sentimentBadgeColors[post.sentiment]}`}
                      >
                        {tCommon(`sentiment.${sentimentKey(post.sentiment)}`)}
                      </Badge>
                    </div>
                    {firstStock && (
                      <span className="text-muted-foreground text-xs">{firstStock.ticker}</span>
                    )}
                  </div>
                  {priceChange !== null && (
                    <span
                      className={`shrink-0 text-sm font-bold ${
                        priceChange >= 0 ? colors.bullish.text : colors.bearish.text
                      }`}
                    >
                      {priceChange >= 0 ? '+' : ''}
                      {priceChange.toFixed(1)}%
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
