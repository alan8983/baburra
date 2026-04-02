'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Rss, User, Youtube, Headphones, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils/date';
import { useSubscriptions, useUnsubscribe } from '@/hooks';
import { EmptyState } from '@/components/shared/empty-state';

const platformIcons: Record<string, typeof Youtube> = {
  youtube: Youtube,
  podcast: Headphones,
};

export default function SubscriptionsPage() {
  const t = useTranslations('subscriptions');
  const { data: subscriptions, isLoading, error } = useSubscriptions();
  const unsubscribe = useUnsubscribe();

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

  const items = subscriptions ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Loading */}
      {isLoading && (
        <Card className="py-12">
          <CardContent className="text-muted-foreground flex justify-center">
            {t('loading')}
          </CardContent>
        </Card>
      )}

      {/* Subscription List */}
      {!isLoading && items.length > 0 && (
        <div className="space-y-4">
          {items.map((sub) => {
            const PlatformIcon = platformIcons[sub.platform] ?? Rss;

            return (
              <Card key={sub.id} className="hover:bg-muted/50 transition-colors">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-4">
                    <Link
                      href={ROUTES.KOL_DETAIL(sub.kolId)}
                      className="flex min-w-0 flex-1 items-center gap-4"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={sub.kolAvatarUrl || undefined} />
                        <AvatarFallback>
                          <User className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{sub.kolName}</span>
                          <Badge variant="outline" className="gap-1">
                            <PlatformIcon className="h-3 w-3" />
                            {sub.platform}
                          </Badge>
                          <Badge variant={sub.monitoringEnabled ? 'default' : 'secondary'}>
                            {sub.monitoringEnabled ? t('monitoring') : t('monitoringOff')}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {sub.lastScrapedAt
                            ? t('lastScraped', { date: formatDateTime(sub.lastScrapedAt) })
                            : t('neverScraped')}
                        </p>
                      </div>
                    </Link>

                    {/* Unsubscribe button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() =>
                        unsubscribe.mutate(
                          { kolId: sub.kolId, sourceId: sub.kolSourceId },
                          {
                            onSuccess: () => toast.success(t('unfollow')),
                            onError: () => toast.error(t('errors.unsubscribeFailed')),
                          }
                        )
                      }
                      disabled={unsubscribe.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={<Rss className="h-12 w-12" />}
          title={t('empty.title')}
          description={t('empty.description')}
          primaryAction={{ label: t('empty.action'), href: ROUTES.SCRAPE }}
        />
      )}
    </div>
  );
}
