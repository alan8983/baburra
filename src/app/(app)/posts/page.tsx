'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, User, Filter, Trash2, Newspaper } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ROUTES } from '@/lib/constants';
import { sentimentKey } from '@/lib/utils/sentiment';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { formatDateTime } from '@/lib/utils/date';
import { usePosts, useDeletePost } from '@/hooks';
import { EmptyState } from '@/components/shared/empty-state';

export default function PostsPage() {
  const router = useRouter();
  const t = useTranslations('posts');
  const tCommon = useTranslations('common');
  const { colors } = useColorPalette();
  const [searchQuery, setSearchQuery] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [openDeleteId, setOpenDeleteId] = useState<string | null>(null);
  const deletePost = useDeletePost();
  const { data, isLoading, error } = usePosts({
    search: searchQuery || undefined,
  });

  const filteredPosts = useMemo(() => {
    const posts = data?.data ?? [];
    const q = searchQuery.toLowerCase().trim();
    return posts.filter((post) => {
      const matchesSearch =
        !q ||
        post.content.toLowerCase().includes(q) ||
        post.kol.name.toLowerCase().includes(q) ||
        post.stocks.some(
          (s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
        );
      const matchesSentiment =
        sentimentFilter === 'all' || post.sentiment.toString() === sentimentFilter;
      return matchesSearch && matchesSentiment;
    });
  }, [data?.data, searchQuery, sentimentFilter]);

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">{tCommon('errors.generic')}</p>
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

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
          <Input
            placeholder={t('search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder={t('sentimentFilter.title')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('sentimentFilter.all')}</SelectItem>
            <SelectItem value="2">{t('sentimentFilter.stronglyBullish')}</SelectItem>
            <SelectItem value="1">{t('sentimentFilter.bullish')}</SelectItem>
            <SelectItem value="0">{t('sentimentFilter.neutral')}</SelectItem>
            <SelectItem value="-1">{t('sentimentFilter.bearish')}</SelectItem>
            <SelectItem value="-2">{t('sentimentFilter.stronglyBearish')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {isLoading && (
        <Card className="py-12">
          <CardContent className="text-muted-foreground flex justify-center">
            {t('loading')}
          </CardContent>
        </Card>
      )}

      {/* Post List */}
      {!isLoading && (
        <div className="space-y-4">
          {filteredPosts.map((post) => {
            const priceByStockId = post.priceChanges ?? {};
            return (
              <Card
                key={post.id}
                className="hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => router.push(ROUTES.POST_DETAIL(post.id))}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start gap-4">
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
                          className={colors.sentimentBadgeColors[post.sentiment]}
                        >
                          {tCommon(`sentiment.${sentimentKey(post.sentiment)}`)}
                        </Badge>
                        <span className="text-muted-foreground text-sm">
                          {formatDateTime(post.postedAt)}
                        </span>
                      </div>

                      {/* Stocks */}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {post.stocks.map((stock) => {
                          const c = priceByStockId[stock.id];
                          const best =
                            c?.day5 != null
                              ? { label: '5d', value: c.day5 }
                              : c?.day30 != null
                                ? { label: '30d', value: c.day30 }
                                : c?.day90 != null
                                  ? { label: '90d', value: c.day90 }
                                  : c?.day365 != null
                                    ? { label: '1y', value: c.day365 }
                                    : null;
                          return (
                            <div key={stock.ticker} className="flex items-center gap-1 text-sm">
                              <Badge variant="outline">{stock.ticker}</Badge>
                              {best ? (
                                <>
                                  <span className="text-muted-foreground text-xs">
                                    {best.label}
                                  </span>
                                  <span
                                    className={
                                      best.value >= 0 ? colors.bullish.text : colors.bearish.text
                                    }
                                  >
                                    {best.value >= 0 ? '+' : ''}
                                    {best.value.toFixed(1)}%
                                  </span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                        {post.content}
                      </p>
                    </div>
                    <Popover
                      open={openDeleteId === post.id}
                      onOpenChange={(open) => !open && setOpenDeleteId(null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDeleteId(post.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-3" onClick={(e) => e.stopPropagation()}>
                        <p className="text-sm font-medium">{t('detail.deleteConfirm')}</p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deletePost.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePost.mutate(post.id, {
                                onSuccess: () => {
                                  setOpenDeleteId(null);
                                  toast.success(t('detail.deleteSuccess'));
                                },
                                onError: () => toast.error(t('detail.deleteFailed')),
                              });
                            }}
                          >
                            {t('detail.deleteConfirmYes')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDeleteId(null);
                            }}
                          >
                            {t('detail.deleteConfirmNo')}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading &&
        filteredPosts.length === 0 &&
        (searchQuery || sentimentFilter !== 'all' ? (
          <Card className="py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <Search className="text-muted-foreground h-12 w-12" />
              <h3 className="mt-4 text-lg font-semibold">{t('empty.noPosts')}</h3>
              <p className="text-muted-foreground mt-2 text-sm">{t('empty.description')}</p>
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={<Newspaper className="h-12 w-12" />}
            title={t('empty.noPosts')}
            description={t('empty.description')}
            primaryAction={{ label: t('empty.importKol'), href: ROUTES.IMPORT }}
            secondaryAction={{ label: t('empty.addPost'), href: ROUTES.INPUT }}
          />
        ))}
    </div>
  );
}
