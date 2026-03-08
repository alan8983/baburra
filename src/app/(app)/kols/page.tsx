'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Search, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/utils/date';
import { useKols } from '@/hooks';
import { EmptyState } from '@/components/shared/empty-state';

export default function KolsPage() {
  const router = useRouter();
  const t = useTranslations('kols');
  const [searchQuery, setSearchQuery] = useState('');
  const { data, isLoading, error } = useKols({ search: searchQuery || undefined });

  const kols = data?.data ?? [];
  const filteredKols = kols;

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
          {t('newKol')}
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

      {/* KOL Grid */}
      {!isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredKols.map((kol) => (
            <Card
              key={kol.id}
              className="hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => router.push(ROUTES.KOL_DETAIL(kol.id))}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={kol.avatarUrl || undefined} />
                    <AvatarFallback>
                      <User className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">{kol.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {t('stats.recentPost')} {kol.lastPostAt ? formatDate(kol.lastPostAt) : '—'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('stats.postCount')} </span>
                    <span className="font-medium">{kol.postCount}</span>
                  </div>
                  <Badge
                    variant={
                      kol.returnRate != null && kol.returnRate >= 0 ? 'default' : 'secondary'
                    }
                    className={kol.returnRate != null && kol.returnRate >= 0 ? 'bg-green-600' : ''}
                  >
                    {kol.returnRate != null
                      ? t('stats.returnRate', {
                          percent: `${kol.returnRate >= 0 ? '+' : ''}${kol.returnRate.toFixed(1)}`,
                        })
                      : '—'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading &&
        filteredKols.length === 0 &&
        (searchQuery ? (
          <Card className="py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <Users className="text-muted-foreground h-12 w-12" />
              <h3 className="mt-4 text-lg font-semibold">{t('empty.noKols')}</h3>
              <p className="text-muted-foreground mt-2 text-sm">
                {t('empty.noResults', { query: searchQuery })}
              </p>
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title={t('empty.noKols')}
            description={t('empty.description')}
            primaryAction={{ label: t('empty.importKol'), href: ROUTES.INPUT }}
          />
        ))}
    </div>
  );
}
