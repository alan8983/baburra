'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ROUTES } from '@/lib/constants';
import {
  KOLSelector,
  KOLFormDialog,
  StockSelector,
  StockFormDialog,
  SentimentSelector,
  DatetimeInput,
  ImageUploader,
} from '@/components/forms';
import type { KOLSearchResult, StockSearchResult, Sentiment } from '@/domain/models';
import { useDraft, useUpdateDraft, useDeleteDraft } from '@/hooks';

export default function DraftEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: draft, isLoading, error } = useDraft(id);
  const updateDraft = useUpdateDraft(id);
  const deleteDraft = useDeleteDraft();

  // 表單狀態（由 API 資料初始化）
  const [selectedKOL, setSelectedKOL] = useState<KOLSearchResult | null>(null);
  const [selectedStocks, setSelectedStocks] = useState<StockSearchResult[]>([]);
  const [content, setContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [postedAt, setPostedAt] = useState<Date | null>(null);
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    if (!draft) return;
    setSelectedKOL(
      draft.kol ? { id: draft.kol.id, name: draft.kol.name, avatarUrl: draft.kol.avatarUrl } : null
    );
    setSelectedStocks(
      draft.stocks.map((s) => ({ id: s.id, ticker: s.ticker, name: s.name, logoUrl: null }))
    );
    setContent(draft.content ?? '');
    setSourceUrl(draft.sourceUrl ?? '');
    setSentiment(draft.sentiment as Sentiment | null);
    setPostedAt(draft.postedAt ? new Date(draft.postedAt) : null);
    setImages(draft.images ?? []);
  }, [draft]);

  // Dialog 狀態
  const [kolDialogOpen, setKolDialogOpen] = useState(false);
  const [kolDialogDefaultName, setKolDialogDefaultName] = useState('');
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockDialogDefaultTicker, setStockDialogDefaultTicker] = useState('');

  // 處理新增 KOL
  const handleCreateKOL = (name: string) => {
    setKolDialogDefaultName(name);
    setKolDialogOpen(true);
  };

  const handleKOLCreated = (kol: KOLSearchResult) => {
    setSelectedKOL(kol);
  };

  // 處理新增 Stock
  const handleCreateStock = (ticker: string) => {
    setStockDialogDefaultTicker(ticker);
    setStockDialogOpen(true);
  };

  const handleStockCreated = (stock: StockSearchResult) => {
    setSelectedStocks((prev) => [...prev, stock]);
  };

  const handleSave = async () => {
    try {
      await updateDraft.mutateAsync({
        kolId: selectedKOL?.id ?? null,
        content: content || null,
        sourceUrl: sourceUrl || null,
        sentiment: sentiment ?? null,
        postedAt: postedAt ?? null,
        stockIds: selectedStocks.map((s) => s.id),
        images,
      });
    } catch {
      // error handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除此草稿？')) return;
    try {
      await deleteDraft.mutateAsync(id);
      router.push(ROUTES.DRAFTS);
    } catch {
      // error handled by mutation
    }
  };

  if (isLoading || (!draft && !error)) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="text-muted-foreground">載入中...</p>
      </div>
    );
  }
  if (error || !draft) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="text-destructive">無法載入草稿</p>
        <Button variant="outline" asChild>
          <Link href={ROUTES.DRAFTS}>返回草稿列表</Link>
        </Button>
      </div>
    );
  }

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
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={handleDelete}
          disabled={deleteDraft.isPending}
        >
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
            <Label>
              KOL <span className="text-destructive">*</span>
            </Label>
            <KOLSelector
              value={selectedKOL}
              onChange={setSelectedKOL}
              onCreateNew={handleCreateKOL}
              placeholder="搜尋或選擇 KOL..."
            />
          </div>

          <Separator />

          {/* Stock Selector */}
          <div className="space-y-2">
            <Label>
              投資標的 <span className="text-destructive">*</span>
            </Label>
            <StockSelector
              value={selectedStocks}
              onChange={setSelectedStocks}
              onCreateNew={handleCreateStock}
              placeholder="搜尋或選擇標的 (可多選)..."
            />
          </div>

          <Separator />

          {/* Posted At */}
          <DatetimeInput
            label="發文時間"
            required
            value={postedAt}
            onChange={setPostedAt}
            showQuickOptions
            max={new Date()}
          />

          <Separator />

          {/* Content */}
          <div className="space-y-2">
            <Label>
              主文內容 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="KOL 的原始發文內容..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
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
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </div>

          <Separator />

          {/* Images */}
          <ImageUploader
            value={images}
            onChange={setImages}
            maxImages={10}
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={handleSave}
          disabled={updateDraft.isPending}
        >
          儲存草稿
        </Button>
        <Button asChild>
          <Link href={ROUTES.POST_NEW}>
            預覽並確認
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Sentiment Selection */}
      <Card>
        <CardHeader>
          <CardTitle>走勢情緒</CardTitle>
          <CardDescription>
            選擇這篇文章的整體看法方向
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SentimentSelector
            value={sentiment}
            onChange={setSentiment}
            showIcon
            aiSuggestion={1}
            onAcceptAiSuggestion={() => setSentiment(1)}
          />
        </CardContent>
      </Card>

      {/* KOL Form Dialog */}
      <KOLFormDialog
        open={kolDialogOpen}
        onOpenChange={setKolDialogOpen}
        defaultName={kolDialogDefaultName}
        onSuccess={handleKOLCreated}
      />

      {/* Stock Form Dialog */}
      <StockFormDialog
        open={stockDialogOpen}
        onOpenChange={setStockDialogOpen}
        defaultTicker={stockDialogDefaultTicker}
        onSuccess={handleStockCreated}
      />
    </div>
  );
}
