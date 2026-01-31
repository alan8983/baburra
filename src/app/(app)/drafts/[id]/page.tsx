'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ROUTES } from '@/lib/constants';

// 模擬草稿資料
const mockDraft = {
  id: '1',
  kolId: '1',
  kolName: '股癌',
  stockIds: ['1', '2'],
  stockTickers: ['TSLA', 'NVDA'],
  content: `特斯拉最新財報分析：

1. 營收成長 25%，超出市場預期
2. 毛利率持續受壓，主要受到價格戰影響
3. FSD 授權收入成為新成長動能

整體來看，雖然短期毛利率有壓力，但長期仍看好特斯拉的競爭優勢。建議逢低佈局。`,
  sourceUrl: 'https://twitter.com/example/status/123456',
  sentiment: 1,
  postedAt: '2026-01-30T14:30:00',
};

const sentimentOptions = [
  { value: -2, label: '強烈看空', color: 'bg-red-600 text-white' },
  { value: -1, label: '看空', color: 'bg-red-100 text-red-700' },
  { value: 0, label: '中立', color: 'bg-gray-100 text-gray-700' },
  { value: 1, label: '看多', color: 'bg-green-100 text-green-700' },
  { value: 2, label: '強烈看多', color: 'bg-green-600 text-white' },
];

export default function DraftEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [draft, setDraft] = useState(mockDraft);
  const [kolSearch, setKolSearch] = useState('');
  const [stockSearch, setStockSearch] = useState('');

  const handleSentimentChange = (value: number) => {
    setDraft({ ...draft, sentiment: value });
  };

  const handleRemoveStock = (ticker: string) => {
    setDraft({
      ...draft,
      stockTickers: draft.stockTickers.filter((t) => t !== ticker),
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.DRAFTS}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回草稿列表
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          刪除草稿
        </Button>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>編輯草稿</CardTitle>
          <CardDescription>
            完善文章資訊後即可發布
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* KOL Selector */}
          <div className="space-y-2">
            <Label>KOL *</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜尋或選擇 KOL..."
                value={draft.kolName || kolSearch}
                onChange={(e) => setKolSearch(e.target.value)}
                className="pl-9"
              />
              {draft.kolName && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1"
                  onClick={() => setDraft({ ...draft, kolId: '', kolName: '' })}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              新增 KOL
            </Button>
          </div>

          <Separator />

          {/* Stock Selector */}
          <div className="space-y-2">
            <Label>投資標的 *</Label>
            {draft.stockTickers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {draft.stockTickers.map((ticker) => (
                  <Badge
                    key={ticker}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => handleRemoveStock(ticker)}
                  >
                    {ticker}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜尋或選擇標的 (可多選)..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              新增標的
            </Button>
          </div>

          <Separator />

          {/* Posted At */}
          <div className="space-y-2">
            <Label>發文時間 *</Label>
            <Input
              type="datetime-local"
              value={draft.postedAt.slice(0, 16)}
              onChange={(e) =>
                setDraft({ ...draft, postedAt: e.target.value })
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm">
                現在
              </Button>
              <Button variant="outline" size="sm">
                1小時前
              </Button>
              <Button variant="outline" size="sm">
                1天前
              </Button>
              <Button variant="outline" size="sm">
                3天前
              </Button>
            </div>
          </div>

          <Separator />

          {/* Content */}
          <div className="space-y-2">
            <Label>主文內容 *</Label>
            <Textarea
              placeholder="KOL 的原始發文內容..."
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              className="min-h-[200px]"
            />
          </div>

          <Separator />

          {/* Source URL */}
          <div className="space-y-2">
            <Label>原始網址</Label>
            <Input
              type="url"
              placeholder="https://..."
              value={draft.sourceUrl}
              onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
            />
          </div>

          <Separator />

          {/* Images */}
          <div className="space-y-2">
            <Label>圖片</Label>
            <div className="flex gap-2">
              <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed">
                <Plus className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              點擊上傳圖片，最多 10 張
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button variant="outline">儲存草稿</Button>
        <Button>
          預覽並確認
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Sentiment Selection (Preview) */}
      <Card>
        <CardHeader>
          <CardTitle>走勢情緒</CardTitle>
          <CardDescription>
            這將在預覽確認頁選擇，此處為預覽
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {sentimentOptions.map((option) => (
              <Button
                key={option.value}
                variant={draft.sentiment === option.value ? 'default' : 'outline'}
                size="sm"
                className={draft.sentiment === option.value ? option.color : ''}
                onClick={() => handleSentimentChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
