'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { FileText, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/utils/date';
import { useDrafts, useDeleteDraft } from '@/hooks';

const sentimentLabels: Record<number, { label: string; color: string }> = {
  [-2]: { label: '強烈看空', color: 'bg-red-100 text-red-700' },
  [-1]: { label: '看空', color: 'bg-red-50 text-red-600' },
  [0]: { label: '中立', color: 'bg-gray-100 text-gray-600' },
  [1]: { label: '看多', color: 'bg-green-50 text-green-600' },
  [2]: { label: '強烈看多', color: 'bg-green-100 text-green-700' },
};

export default function DraftsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data, isLoading, error } = useDrafts();
  const deleteDraft = useDeleteDraft();

  const filteredDrafts = useMemo(() => {
    const drafts = data?.data ?? [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return drafts;
    return drafts.filter(
      (draft) =>
        (draft.content ?? '').toLowerCase().includes(q) ||
        draft.kol?.name?.toLowerCase().includes(q) ||
        draft.stocks.some(
          (s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
        )
    );
  }, [data?.data, searchQuery]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('確定要刪除此草稿？')) return;
    try {
      await deleteDraft.mutateAsync(id);
    } catch {
      // error handled by mutation
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">草稿</h1>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">無法載入草稿，請稍後再試。</p>
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
          <h1 className="text-3xl font-bold tracking-tight">草稿</h1>
          <p className="text-muted-foreground">管理尚未發布的文章草稿</p>
        </div>
        <Button asChild>
          <Link href={ROUTES.INPUT}>
            <Plus className="mr-2 h-4 w-4" />
            新增草稿
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
        <Input
          placeholder="搜尋草稿..."
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

      {/* Draft List */}
      {!isLoading && (
        <div className="space-y-4">
          {filteredDrafts.map((draft) => {
            const kolName = draft.kol?.name ?? null;
            const stockTickers = draft.stocks.map((s) => s.ticker);
            const contentPreview = draft.content ?? '';
            const isComplete = Boolean(
              draft.kolId &&
              draft.content &&
              draft.sentiment != null &&
              draft.postedAt &&
              draft.stockIds.length > 0
            );
            return (
              <Card key={draft.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <Link href={ROUTES.DRAFT_DETAIL(draft.id)} className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {kolName ? (
                          <span className="font-medium">{kolName}</span>
                        ) : (
                          <span className="text-muted-foreground italic">未選擇 KOL</span>
                        )}
                        {stockTickers.length > 0 && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            {stockTickers.map((ticker) => (
                              <Badge key={ticker} variant="outline" className="text-xs">
                                {ticker}
                              </Badge>
                            ))}
                          </>
                        )}
                        {draft.sentiment !== null && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <Badge
                              variant="outline"
                              className={sentimentLabels[draft.sentiment as number]?.color}
                            >
                              {sentimentLabels[draft.sentiment as number]?.label}
                            </Badge>
                          </>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                        {contentPreview || '（尚無內容）'}
                      </p>
                      <div className="text-muted-foreground mt-2 flex items-center gap-4 text-xs">
                        <span>更新於 {formatRelativeTime(draft.updatedAt)}</span>
                        {isComplete ? (
                          <Badge variant="default" className="text-xs">
                            可發布
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            未完成
                          </Badge>
                        )}
                      </div>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => handleDelete(e, draft.id)}
                      disabled={deleteDraft.isPending}
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
      {!isLoading && filteredDrafts.length === 0 && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <FileText className="text-muted-foreground h-12 w-12" />
            <h3 className="mt-4 text-lg font-semibold">沒有草稿</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              {searchQuery ? `沒有符合「${searchQuery}」的草稿` : '開始輸入文章內容來建立草稿'}
            </p>
            {!searchQuery && (
              <Button className="mt-4" asChild>
                <Link href={ROUTES.INPUT}>
                  <Plus className="mr-2 h-4 w-4" />
                  新增草稿
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
