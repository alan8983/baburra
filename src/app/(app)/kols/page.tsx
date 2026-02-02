'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/utils/date';
import { useKols } from '@/hooks';

export default function KolsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data, isLoading, error } = useKols({ search: searchQuery || undefined });

  const kols = data?.data ?? [];
  const filteredKols = kols;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">KOL 列表</h1>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">無法載入 KOL 列表，請稍後再試。</p>
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
          <h1 className="text-3xl font-bold tracking-tight">KOL 列表</h1>
          <p className="text-muted-foreground">瀏覽和管理所有追蹤中的 KOL</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          新增 KOL
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
        <Input
          placeholder="搜尋 KOL..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <Card className="py-12">
          <CardContent className="text-muted-foreground flex justify-center">載入中...</CardContent>
        </Card>
      )}

      {/* KOL Grid */}
      {!isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredKols.map((kol) => (
            <Link key={kol.id} href={ROUTES.KOL_DETAIL(kol.id)}>
              <Card className="hover:bg-muted/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={kol.avatarUrl || undefined} />
                      <AvatarFallback>
                        <User className="h-6 w-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">{kol.name}</CardTitle>
                      <CardDescription className="text-xs">
                        最近發文: {kol.lastPostAt ? formatDate(kol.lastPostAt) : '—'}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-muted-foreground">文章數: </span>
                      <span className="font-medium">{kol.postCount}</span>
                    </div>
                    <Badge
                      variant={kol.winRate != null && kol.winRate >= 0.6 ? 'default' : 'secondary'}
                      className={kol.winRate != null && kol.winRate >= 0.6 ? 'bg-green-600' : ''}
                    >
                      勝率 {kol.winRate != null ? `${(kol.winRate * 100).toFixed(0)}%` : '—'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredKols.length === 0 && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <User className="text-muted-foreground h-12 w-12" />
            <h3 className="mt-4 text-lg font-semibold">找不到 KOL</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              {searchQuery
                ? `沒有符合「${searchQuery}」的 KOL`
                : '還沒有任何 KOL，點擊上方按鈕新增'}
            </p>
            {!searchQuery && (
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                新增 KOL
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
