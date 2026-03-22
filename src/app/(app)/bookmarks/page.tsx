'use client';

import Link from 'next/link';
import { Bookmark, User, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { sentimentKey } from '@/lib/utils/sentiment';
import { formatDateTime } from '@/lib/utils/date';
import { useBookmarks, useRemoveBookmark } from '@/hooks';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';
import { getStaggerClass } from '@/lib/animations';

export default function BookmarksPage() {
  const t = useTranslations('bookmarks');
  const tCommon = useTranslations('common');
  const { colors } = useColorPalette();
  const { data, isLoading, error } = useBookmarks();
  const removeBookmark = useRemoveBookmark();

  const bookmarks = data?.data ?? [];

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

      {/* Bookmark List */}
      {!isLoading && bookmarks.length > 0 && (
        <div className="space-y-4">
          {bookmarks.map((bookmark, i) => {
            const post = bookmark.post;
            return (
              <Card
                key={bookmark.id}
                className={`hover:bg-muted/50 transition-colors ${getStaggerClass(i)}`}
                style={{ opacity: 0 }}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start gap-4">
                    <Link
                      href={ROUTES.POST_DETAIL(post.id)}
                      className="flex min-w-0 flex-1 items-start gap-4"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={post.kol.avatarUrl || undefined} />
                        <AvatarFallback>
                          <User className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{post.kol.name}</span>
                          <Badge
                            variant="outline"
                            className={
                              colors.sentimentBadgeColors[
                                post.sentiment as keyof typeof colors.sentimentBadgeColors
                              ]
                            }
                          >
                            {tCommon(`sentiment.${sentimentKey(post.sentiment)}`)}
                          </Badge>
                          <span className="text-muted-foreground text-sm">
                            {formatDateTime(post.postedAt)}
                          </span>
                        </div>

                        {/* Stocks */}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {post.stocks.map((stock) => (
                            <Badge key={stock.ticker} variant="outline">
                              {stock.ticker}
                            </Badge>
                          ))}
                        </div>

                        <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                          {post.content}
                        </p>
                      </div>
                    </Link>

                    {/* Remove button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() =>
                        removeBookmark.mutate(post.id, {
                          onSuccess: () => toast.success(t('removeSuccess')),
                        })
                      }
                      disabled={removeBookmark.isPending}
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
      {!isLoading && bookmarks.length === 0 && (
        <EmptyState
          icon={<Bookmark className="h-12 w-12" />}
          title={t('empty.noBookmarks')}
          description={t('empty.description')}
          primaryAction={{ label: t('empty.browsePosts'), href: ROUTES.POSTS }}
        />
      )}
    </div>
  );
}
