'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Trash2,
  Link2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ROUTES } from '@/lib/constants';
import {
  KOLSelector,
  KOLFormDialog,
  StockSelector,
  StockFormDialog,
  SentimentSelector,
  DatetimeInput,
  ImageUploader,
  AiTickerSuggestions,
} from '@/components/forms';
import type {
  KOLSearchResult,
  StockSearchResult,
  Sentiment,
  DraftWithRelations,
} from '@/domain/models';
import {
  useDraft,
  useUpdateDraft,
  useDeleteDraft,
  useFetchUrl,
  isUrlLike,
  getSupportedPlatform,
  getSupportedPlatformNames,
} from '@/hooks';
import { useIdentifyTickers, useAiUsage } from '@/hooks/use-ai';
import type { IdentifiedTicker } from '@/hooks/use-ai';
import { API_ROUTES } from '@/lib/constants/routes';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

// 表單組件 - 接收 draft 作為 prop，使用 key 來重置狀態
interface DraftEditFormProps {
  draft: DraftWithRelations;
  id: string;
}

function DraftEditForm({ draft, id }: DraftEditFormProps) {
  const router = useRouter();
  const updateDraft = useUpdateDraft(id);
  const deleteDraft = useDeleteDraft();

  // 表單狀態（直接從 draft 初始化）
  const [selectedKOL, setSelectedKOL] = useState<KOLSearchResult | null>(() =>
    draft.kol ? { id: draft.kol.id, name: draft.kol.name, avatarUrl: draft.kol.avatarUrl } : null
  );
  const [selectedStocks, setSelectedStocks] = useState<StockSearchResult[]>(() =>
    draft.stocks.map((s) => ({ id: s.id, ticker: s.ticker, name: s.name, logoUrl: null }))
  );
  const [content, setContent] = useState(() => draft.content ?? '');
  const [sourceUrl, setSourceUrl] = useState(() => draft.sourceUrl ?? '');
  const [sentiment, setSentiment] = useState<Sentiment | null>(
    () => draft.sentiment as Sentiment | null
  );
  const [postedAt, setPostedAt] = useState<Date | null>(() =>
    draft.postedAt ? new Date(draft.postedAt) : null
  );
  const [images, setImages] = useState<string[]>(() => draft.images ?? []);

  // Dialog 狀態
  const [kolDialogOpen, setKolDialogOpen] = useState(false);
  const [kolDialogDefaultName, setKolDialogDefaultName] = useState('');
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockDialogDefaultTicker, setStockDialogDefaultTicker] = useState('');
  const [fetchDialogOpen, setFetchDialogOpen] = useState(false);
  const [fetchResult, setFetchResult] = useState<{
    content: string;
    images: string[];
    postedAt: Date | null;
    kolName: string | null;
  } | null>(null);
  const [applyFields, setApplyFields] = useState({
    content: false,
    images: false,
    postedAt: false,
    kolName: false,
  });

  const fetchUrl = useFetchUrl();

  // AI ticker identification
  const t = useTranslations('common.ai');
  const [tickerSuggestions, setTickerSuggestions] = useState<IdentifiedTicker[]>([]);
  const identifyTickers = useIdentifyTickers();
  const { data: aiUsage } = useAiUsage();

  // Auto-save state
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);

  const doAutoSave = useCallback(async () => {
    setAutoSaveStatus('saving');
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
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch {
      setAutoSaveStatus('idle');
    }
  }, [updateDraft, selectedKOL, content, sourceUrl, sentiment, postedAt, selectedStocks, images]);

  // Debounced auto-save: trigger 3 seconds after last change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      doAutoSave();
    }, 3000);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [content, sourceUrl, sentiment, selectedKOL, selectedStocks, postedAt, images]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // AI 識別標的
  const handleIdentifyTickers = async () => {
    if (!content || content.length < 10) return;
    try {
      const result = await identifyTickers.mutateAsync(content);
      setTickerSuggestions(result.tickers);
      if (result.tickers.length === 0) {
        toast.info(t('noTickersFound'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('noTickersFound'));
    }
  };

  const handleAcceptTicker = async (identified: IdentifiedTicker) => {
    try {
      const searchRes = await fetch(
        `${API_ROUTES.STOCKS}?search=${encodeURIComponent(identified.ticker)}&limit=5`
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const match = searchData.data?.find(
          (s: StockSearchResult) => s.ticker.toUpperCase() === identified.ticker.toUpperCase()
        );
        if (match && !selectedStocks.some((s) => s.id === match.id)) {
          setSelectedStocks((prev) => [...prev, match]);
          return;
        }
      }
    } catch {
      // 搜尋失敗，fallback 到建立新 stock
    }
    setStockDialogDefaultTicker(identified.ticker);
    setStockDialogOpen(true);
  };

  const handleAcceptAllTickers = async () => {
    const existingSet = new Set(selectedStocks.map((s) => s.ticker.toUpperCase()));
    const unadded = tickerSuggestions.filter((s) => !existingSet.has(s.ticker.toUpperCase()));
    for (const ticker of unadded) {
      await handleAcceptTicker(ticker);
    }
  };

  // 處理 URL 擷取
  const handleFetchUrl = async () => {
    if (!sourceUrl || !isUrlLike(sourceUrl)) {
      toast.error('請輸入有效的 URL');
      return;
    }
    try {
      const result = await fetchUrl.mutateAsync(sourceUrl);
      setFetchResult({
        content: result.content,
        images: result.images || [],
        postedAt: result.postedAt ? new Date(result.postedAt) : null,
        kolName: result.kolName,
      });
      // 預設勾選所有欄位
      setApplyFields({
        content: true,
        images: true,
        postedAt: true,
        kolName: !selectedKOL && !!result.kolName, // 只有當沒有選 KOL 時才預設勾選
      });
      setFetchDialogOpen(true);
      toast.success('內容擷取成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '擷取失敗，請稍後再試';
      toast.error('擷取失敗', {
        description: errorMessage,
      });
    }
  };

  // 套用擷取的欄位
  const handleApplyFetchResult = async () => {
    if (!fetchResult) return;

    const updates: {
      content?: string | null;
      images?: string[];
      postedAt?: Date | null;
      kolNameInput?: string | null;
    } = {};

    if (applyFields.content) {
      updates.content = fetchResult.content;
    }
    if (applyFields.images) {
      updates.images = fetchResult.images;
    }
    if (applyFields.postedAt && fetchResult.postedAt) {
      updates.postedAt = fetchResult.postedAt;
    }
    if (applyFields.kolName && fetchResult.kolName && !selectedKOL) {
      updates.kolNameInput = fetchResult.kolName;
    }

    // 更新表單狀態
    if (applyFields.content) {
      setContent(fetchResult.content);
    }
    if (applyFields.images) {
      setImages(fetchResult.images);
    }
    if (applyFields.postedAt && fetchResult.postedAt) {
      setPostedAt(fetchResult.postedAt);
    }
    if (applyFields.kolName && fetchResult.kolName && !selectedKOL) {
      setKolDialogDefaultName(fetchResult.kolName);
    }

    // 儲存到草稿
    try {
      await updateDraft.mutateAsync({
        kolId: selectedKOL?.id ?? null,
        content: applyFields.content ? fetchResult.content : content || null,
        sourceUrl: sourceUrl || null,
        sentiment: sentiment ?? null,
        postedAt:
          applyFields.postedAt && fetchResult.postedAt ? fetchResult.postedAt : (postedAt ?? null),
        stockIds: selectedStocks.map((s) => s.id),
        images: applyFields.images ? fetchResult.images : images,
        kolNameInput:
          applyFields.kolName && fetchResult.kolName && !selectedKOL
            ? fetchResult.kolName
            : undefined,
      });
      setFetchDialogOpen(false);
      setFetchResult(null);
      toast.success('已套用擷取的內容');
    } catch (error) {
      toast.error('套用失敗', {
        description: error instanceof Error ? error.message : '請稍後再試',
      });
    }
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
        <div className="flex items-center gap-3">
          {autoSaveStatus === 'saving' && (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              儲存中...
            </span>
          )}
          {autoSaveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              已儲存
            </span>
          )}
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
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>編輯草稿</CardTitle>
          <CardDescription>完善文章資訊後即可發布</CardDescription>
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
            <div className="flex items-center justify-between">
              <Label>
                投資標的 <span className="text-destructive">*</span>
              </Label>
              {content.length >= 10 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleIdentifyTickers}
                  disabled={identifyTickers.isPending || (aiUsage?.remaining ?? 0) <= 0}
                >
                  {identifyTickers.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('identifyingTickers')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {t('identifyTickers')}
                    </>
                  )}
                </Button>
              )}
            </div>
            <StockSelector
              value={selectedStocks}
              onChange={setSelectedStocks}
              onCreateNew={handleCreateStock}
              placeholder="搜尋或選擇標的 (可多選)..."
            />
            <AiTickerSuggestions
              suggestions={tickerSuggestions}
              existingStocks={selectedStocks}
              onAccept={handleAcceptTicker}
              onAcceptAll={handleAcceptAllTickers}
              onDismiss={() => setTickerSuggestions([])}
              isLoading={identifyTickers.isPending}
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
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://..."
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleFetchUrl}
                disabled={
                  !sourceUrl ||
                  !isUrlLike(sourceUrl) ||
                  !getSupportedPlatform(sourceUrl) ||
                  fetchUrl.isPending
                }
              >
                {fetchUrl.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    擷取中...
                  </>
                ) : (
                  <>
                    <Link2 className="mr-2 h-4 w-4" />
                    擷取
                  </>
                )}
              </Button>
            </div>
            {/* 不支援的 URL 警告 */}
            {sourceUrl && isUrlLike(sourceUrl) && !getSupportedPlatform(sourceUrl) && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <p className="text-sm text-amber-700">
                  此網址平台尚不支援自動擷取內容（支援：{getSupportedPlatformNames().join('、')}）。
                  網址仍會作為來源連結保存，但請手動填寫文章內容。
                </p>
              </div>
            )}
            {/* 支援的 URL 提示 */}
            {sourceUrl &&
              isUrlLike(sourceUrl) &&
              getSupportedPlatform(sourceUrl) &&
              !fetchUrl.isPending && (
                <p className="text-muted-foreground text-xs">
                  偵測到 {getSupportedPlatform(sourceUrl)} 網址，點擊「擷取」可自動帶入文章內容
                </p>
              )}
          </div>

          <Separator />

          {/* Images */}
          <ImageUploader value={images} onChange={setImages} maxImages={10} />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleSave} disabled={updateDraft.isPending}>
          儲存草稿
        </Button>
        <Button asChild>
          <Link href={`${ROUTES.POST_NEW}?draftId=${id}`}>
            預覽並確認
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Sentiment Selection */}
      <Card>
        <CardHeader>
          <CardTitle>走勢情緒</CardTitle>
          <CardDescription>選擇這篇文章的整體看法方向</CardDescription>
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

      {/* URL Fetch Result Dialog */}
      <Dialog open={fetchDialogOpen} onOpenChange={setFetchDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>確認要套用的欄位</DialogTitle>
            <DialogDescription>
              請選擇要從擷取的內容中套用到草稿的欄位。已選取的欄位將會被覆蓋。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 主文內容 */}
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={applyFields.content}
                onChange={(e) => setApplyFields((prev) => ({ ...prev, content: e.target.checked }))}
                className="mt-1 h-4 w-4"
              />
              <div className="flex-1">
                <Label className="font-medium">主文內容</Label>
                <p className="text-muted-foreground mt-1 text-sm">
                  {fetchResult?.content.slice(0, 150)}
                  {fetchResult && fetchResult.content.length > 150 ? '...' : ''}
                </p>
              </div>
            </div>

            {/* 圖片 */}
            {fetchResult && fetchResult.images.length > 0 && (
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <input
                  type="checkbox"
                  checked={applyFields.images}
                  onChange={(e) =>
                    setApplyFields((prev) => ({ ...prev, images: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4"
                />
                <div className="flex-1">
                  <Label className="font-medium">圖片 ({fetchResult.images.length} 張)</Label>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {fetchResult.images.slice(0, 4).map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt={`擷取圖片 ${i + 1}`}
                        className="aspect-square rounded-lg object-cover"
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 發文時間 */}
            {fetchResult && fetchResult.postedAt && (
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <input
                  type="checkbox"
                  checked={applyFields.postedAt}
                  onChange={(e) =>
                    setApplyFields((prev) => ({ ...prev, postedAt: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4"
                />
                <div className="flex-1">
                  <Label className="font-medium">發文時間</Label>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {new Date(fetchResult.postedAt).toLocaleString('zh-TW')}
                  </p>
                </div>
              </div>
            )}

            {/* KOL 名稱建議 */}
            {fetchResult && fetchResult.kolName && !selectedKOL && (
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <input
                  type="checkbox"
                  checked={applyFields.kolName}
                  onChange={(e) =>
                    setApplyFields((prev) => ({ ...prev, kolName: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4"
                />
                <div className="flex-1">
                  <Label className="font-medium">KOL 名稱建議</Label>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {fetchResult.kolName}（將填入到 KOL 名稱輸入欄位）
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFetchDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleApplyFetchResult} disabled={updateDraft.isPending}>
              {updateDraft.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  套用中...
                </>
              ) : (
                '套用選取的欄位'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 主頁面組件 - 處理 loading/error 狀態並使用 key 重置表單
export default function DraftEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: draft, isLoading, error } = useDraft(id);

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

  // 使用 draft.id 作為 key 來確保表單在 draft 改變時重新初始化
  return <DraftEditForm key={draft.id} draft={draft} id={id} />;
}
