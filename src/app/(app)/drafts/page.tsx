'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/utils/date';

// 模擬草稿資料
const mockDrafts = [
  {
    id: '1',
    kolName: '股癌',
    stockTickers: ['TSLA', 'NVDA'],
    content: '特斯拉最新財報分析，營收成長 25%，但毛利率持續受壓...',
    sentiment: 1,
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2小時前
    isComplete: false,
  },
  {
    id: '2',
    kolName: '財報狗',
    stockTickers: ['AAPL'],
    content: 'Apple Vision Pro 評測，空間運算時代來臨...',
    sentiment: 2,
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1天前
    isComplete: true,
  },
  {
    id: '3',
    kolName: null,
    stockTickers: ['NVDA', 'AMD'],
    content: 'AI 晶片需求持續強勁，NVIDIA 和 AMD 受惠...',
    sentiment: null,
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3天前
    isComplete: false,
  },
];

const sentimentLabels: Record<number, { label: string; color: string }> = {
  [-2]: { label: '強烈看空', color: 'bg-red-100 text-red-700' },
  [-1]: { label: '看空', color: 'bg-red-50 text-red-600' },
  [0]: { label: '中立', color: 'bg-gray-100 text-gray-600' },
  [1]: { label: '看多', color: 'bg-green-50 text-green-600' },
  [2]: { label: '強烈看多', color: 'bg-green-100 text-green-700' },
};

export default function DraftsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDrafts = mockDrafts.filter(
    (draft) =>
      draft.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      draft.kolName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      draft.stockTickers.some((t) =>
        t.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">草稿</h1>
          <p className="text-muted-foreground">
            管理尚未發布的文章草稿
          </p>
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
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜尋草稿..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Draft List */}
      <div className="space-y-4">
        {filteredDrafts.map((draft) => (
          <Card key={draft.id} className="transition-colors hover:bg-muted/30">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <Link
                  href={ROUTES.DRAFT_DETAIL(draft.id)}
                  className="flex-1 min-w-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {draft.kolName ? (
                      <span className="font-medium">{draft.kolName}</span>
                    ) : (
                      <span className="text-muted-foreground italic">
                        未選擇 KOL
                      </span>
                    )}
                    {draft.stockTickers.length > 0 && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        {draft.stockTickers.map((ticker) => (
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
                          className={sentimentLabels[draft.sentiment]?.color}
                        >
                          {sentimentLabels[draft.sentiment]?.label}
                        </Badge>
                      </>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                    {draft.content}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>更新於 {formatRelativeTime(draft.updatedAt)}</span>
                    {draft.isComplete ? (
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
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {filteredDrafts.length === 0 && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">沒有草稿</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {searchQuery
                ? `沒有符合「${searchQuery}」的草稿`
                : '開始輸入文章內容來建立草稿'}
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
