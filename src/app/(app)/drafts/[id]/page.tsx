'use client';

import { use, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { format } from 'date-fns';
import { zhTW, enUS } from 'date-fns/locale';
import {
  ArrowLeft,
  Check,
  Trash2,
  Link2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ArgumentPlaceholder } from '@/components/ai/argument-placeholder';
import type {
  KOLSearchResult,
  StockSearchResult,
  Sentiment,
  CreatePostInput,
  DraftWithRelations,
} from '@/domain/models';
import { useCreatePost, useCheckDuplicateUrl } from '@/hooks/use-posts';
import { detectPlatform } from '@/lib/utils/format';
import { sentimentKey } from '@/lib/utils/sentiment';
import {
  useDraft,
  useUpdateDraft,
  useDeleteDraft,
  useFetchUrl,
  isUrlLike,
  getSupportedPlatform,
  getSupportedPlatformNames,
} from '@/hooks';
import type { IdentifiedTicker } from '@/hooks/use-ai';
import { API_ROUTES } from '@/lib/constants/routes';
import { toast } from 'sonner';

const DATE_FNS_LOCALES: Record<string, typeof zhTW> = { 'zh-TW': zhTW, en: enUS };

/**
 * Parse draft.stockNameInputs (format: "TICKER (Name)") into IdentifiedTicker[]
 */
function parseStockNameInputs(inputs: string[]): IdentifiedTicker[] {
  return inputs
    .map((input) => {
      const match = input.match(/^(.+?)\s*\((.+)\)$/);
      if (match) {
        const ticker = match[1].trim();
        const name = match[2].trim();
        // Infer market from ticker format
        let market: IdentifiedTicker['market'] = 'US';
        if (ticker.endsWith('.TW')) market = 'TW';
        else if (ticker.endsWith('.HK')) market = 'HK';
        else if (['BTC', 'ETH', 'SOL', 'DOGE', 'XRP'].includes(ticker)) market = 'CRYPTO';
        return { ticker, name, market, confidence: 0.8, mentionedAs: name };
      }
      return null;
    })
    .filter((t): t is IdentifiedTicker => t !== null);
}

// 表單組件 - 接收 draft 作為 prop，使用 key 來重置狀態
interface DraftEditFormProps {
  draft: DraftWithRelations;
  id: string;
}

function DraftEditForm({ draft, id }: DraftEditFormProps) {
  const router = useRouter();
  const t = useTranslations('drafts');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const updateDraft = useUpdateDraft(id);
  const deleteDraft = useDeleteDraft();
  const createPost = useCreatePost();

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
  const [stockSentiments, setStockSentiments] = useState<Record<string, Sentiment>>(
    () => draft.stockSentiments ?? {}
  );

  // Dialog 狀態
  const [kolDialogOpen, setKolDialogOpen] = useState(false);
  const [kolDialogDefaultName, setKolDialogDefaultName] = useState('');
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockDialogDefaultTicker, setStockDialogDefaultTicker] = useState('');
  const [stockDialogDefaultName, setStockDialogDefaultName] = useState('');
  const [stockDialogDefaultMarket, setStockDialogDefaultMarket] = useState<
    'US' | 'TW' | 'HK' | 'CRYPTO' | undefined
  >();
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

  // Publish state
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  // Duplicate URL check
  const { data: duplicateCheck } = useCheckDuplicateUrl(sourceUrl);

  // AI ticker suggestions — initialized from draft.stockNameInputs (pre-filled by quick-input)
  const [tickerSuggestions, setTickerSuggestions] = useState<IdentifiedTicker[]>(() =>
    parseStockNameInputs(draft.stockNameInputs ?? [])
  );

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
        stockSentiments: Object.keys(stockSentiments).length > 0 ? stockSentiments : null,
        postedAt: postedAt ?? null,
        stockIds: selectedStocks.map((s) => s.id),
        images,
      });
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch {
      setAutoSaveStatus('idle');
    }
  }, [
    updateDraft,
    selectedKOL,
    content,
    sourceUrl,
    sentiment,
    stockSentiments,
    postedAt,
    selectedStocks,
    images,
  ]);

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
  }, [doAutoSave]);

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
    setStockDialogDefaultName('');
    setStockDialogDefaultMarket(undefined);
    setStockDialogOpen(true);
  };

  const handleStockCreated = (stock: StockSearchResult) => {
    setSelectedStocks((prev) => [...prev, stock]);
  };

  const handleAcceptTicker = async (identified: IdentifiedTicker) => {
    // 1. Try to find existing stock in DB
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
      // 搜尋失敗，continue to auto-create
    }

    // 2. Auto-create stock using AI-provided name
    if (identified.name) {
      try {
        const createRes = await fetch(API_ROUTES.STOCKS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: identified.ticker.toUpperCase(),
            name: identified.name,
            market: identified.market,
          }),
        });
        if (createRes.ok) {
          const newStock = await createRes.json();
          const stockResult: StockSearchResult = {
            id: newStock.id,
            ticker: newStock.ticker,
            name: newStock.name,
            logoUrl: newStock.logoUrl ?? null,
          };
          setSelectedStocks((prev) => [...prev, stockResult]);
          return;
        }
      } catch {
        // Auto-create failed, fallback to dialog
      }
    }

    // 3. Fallback: open dialog with pre-filled ticker + name + market
    setStockDialogDefaultTicker(identified.ticker);
    setStockDialogDefaultName(identified.name);
    setStockDialogDefaultMarket(identified.market);
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
      toast.error(t('detail.fetch.invalidUrl'));
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
      toast.success(t('detail.fetch.success'));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t('detail.fetch.failedDescription');
      toast.error(t('detail.fetch.failed'), {
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
      toast.success(t('detail.fetch.applySuccess'));
    } catch (error) {
      toast.error(t('detail.fetch.applyFailed'), {
        description:
          error instanceof Error ? error.message : t('detail.fetch.applyFailedDescription'),
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
    if (!confirm(t('deleteConfirm'))) return;
    try {
      await deleteDraft.mutateAsync(id);
      router.push(ROUTES.DRAFTS);
    } catch {
      // error handled by mutation
    }
  };

  // Publish validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!selectedKOL) errors.push(t('detail.validation.kol'));
    if (selectedStocks.length === 0) errors.push(t('detail.validation.stocks'));
    if (!content.trim()) errors.push(t('detail.validation.content'));
    if (!postedAt) errors.push(t('detail.validation.postedAt'));
    if (sentiment === null) errors.push(t('detail.validation.sentiment'));
    return errors;
  }, [selectedKOL, selectedStocks, content, postedAt, sentiment, t]);

  const canPublish = validationErrors.length === 0;

  const handlePublish = async () => {
    if (!canPublish) return;

    setIsPublishing(true);
    try {
      // Save draft first to ensure latest state is persisted
      await updateDraft.mutateAsync({
        kolId: selectedKOL?.id ?? null,
        content: content || null,
        sourceUrl: sourceUrl || null,
        sentiment: sentiment ?? null,
        stockSentiments: Object.keys(stockSentiments).length > 0 ? stockSentiments : null,
        postedAt: postedAt ?? null,
        stockIds: selectedStocks.map((s) => s.id),
        images,
      });

      // Map per-stock sentiments from ticker -> stockId
      const postStockSentiments: Record<string, Sentiment> = {};
      for (const stock of selectedStocks) {
        const tickerSentiment = stockSentiments[stock.ticker];
        if (tickerSentiment !== undefined) {
          postStockSentiments[stock.id] = tickerSentiment;
        }
      }

      const input: CreatePostInput = {
        kolId: selectedKOL!.id,
        stockIds: selectedStocks.map((s) => s.id),
        content,
        sourceUrl: sourceUrl || undefined,
        sourcePlatform: detectPlatform(sourceUrl),
        images,
        sentiment: sentiment!,
        stockSentiments:
          Object.keys(postStockSentiments).length > 0 ? postStockSentiments : undefined,
        sentimentAiGenerated: false,
        postedAt: postedAt!,
        draftAiArguments: draft.aiArguments ?? undefined,
      };

      const post = await createPost.mutateAsync(input);

      // Delete draft after successful post creation
      await deleteDraft.mutateAsync(id);

      toast.success(t('detail.publishDialog.publishSuccess'));
      router.push(ROUTES.POST_DETAIL(post.id));
    } catch (error) {
      toast.error(t('detail.publishDialog.publishFailed'), {
        description:
          error instanceof Error
            ? error.message
            : t('detail.publishDialog.publishFailedDescription'),
      });
    } finally {
      setIsPublishing(false);
      setPublishDialogOpen(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.DRAFTS}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('detail.backToDrafts')}
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          {autoSaveStatus === 'saving' && (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('detail.saving')}
            </span>
          )}
          {autoSaveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              {t('detail.saved')}
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
            {t('detail.deleteDraft')}
          </Button>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>{t('detail.title')}</CardTitle>
          <CardDescription>{t('detail.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* KOL Selector */}
          <div className="space-y-2">
            <Label>
              {t('detail.labels.kol')} <span className="text-destructive">*</span>
            </Label>
            <KOLSelector
              value={selectedKOL}
              onChange={setSelectedKOL}
              onCreateNew={handleCreateKOL}
            />
          </div>

          <Separator />

          {/* Stock Selector */}
          <div className="space-y-2">
            <Label>
              {t('detail.labels.stocks')} <span className="text-destructive">*</span>
            </Label>
            <StockSelector
              value={selectedStocks}
              onChange={setSelectedStocks}
              onCreateNew={handleCreateStock}
            />
            <AiTickerSuggestions
              suggestions={tickerSuggestions}
              existingStocks={selectedStocks}
              onAccept={handleAcceptTicker}
              onAcceptAll={handleAcceptAllTickers}
              onDismiss={() => setTickerSuggestions([])}
            />
          </div>

          <Separator />

          {/* Posted At */}
          <DatetimeInput
            label={t('detail.labels.postedAt')}
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
              {t('detail.labels.content')} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder={t('detail.labels.contentPlaceholder')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[200px]"
            />
          </div>

          <Separator />

          {/* Source URL */}
          <div className="space-y-2">
            <Label>{t('detail.labels.sourceUrl')}</Label>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder={t('detail.labels.sourceUrlPlaceholder')}
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
                    {t('detail.fetch.fetching')}
                  </>
                ) : (
                  <>
                    <Link2 className="mr-2 h-4 w-4" />
                    {t('detail.fetch.fetchButton')}
                  </>
                )}
              </Button>
            </div>
            {/* 不支援的 URL 警告 */}
            {sourceUrl && isUrlLike(sourceUrl) && !getSupportedPlatform(sourceUrl) && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <p className="text-sm text-amber-700">
                  {t('detail.fetch.unsupportedUrl', {
                    platforms: getSupportedPlatformNames().join('、'),
                  })}
                </p>
              </div>
            )}
            {/* 支援的 URL 提示 */}
            {sourceUrl &&
              isUrlLike(sourceUrl) &&
              getSupportedPlatform(sourceUrl) &&
              !fetchUrl.isPending && (
                <p className="text-muted-foreground text-xs">
                  {t('detail.fetch.detectedPlatform', {
                    platform: getSupportedPlatform(sourceUrl)!,
                  })}
                </p>
              )}
            {/* 重複 URL 警告 */}
            {sourceUrl && duplicateCheck?.isDuplicate && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-800">
                    {t('detail.duplicateWarning.title')}
                  </p>
                  <p className="text-xs text-amber-700">
                    {t('detail.duplicateWarning.createdAt', {
                      date: format(new Date(duplicateCheck.existingPost!.createdAt), 'yyyy/MM/dd', {
                        locale: DATE_FNS_LOCALES[locale] ?? zhTW,
                      }),
                    })}
                  </p>
                  <Button variant="link" size="sm" className="h-auto p-0 text-amber-700" asChild>
                    <Link href={ROUTES.POST_DETAIL(duplicateCheck.existingPost!.id)}>
                      {t('detail.duplicateWarning.viewExisting')}
                    </Link>
                  </Button>
                </div>
              </div>
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
          {t('detail.saveDraft')}
        </Button>
        <Button onClick={() => setPublishDialogOpen(true)} disabled={isPublishing}>
          <Check className="mr-2 h-4 w-4" />
          {t('detail.publish')}
        </Button>
      </div>

      {/* Sentiment Selection */}
      <Card>
        <CardHeader>
          <CardTitle>{t('detail.labels.sentiment')}</CardTitle>
          <CardDescription>{t('detail.labels.sentimentDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <SentimentSelector value={sentiment} onChange={setSentiment} showIcon />
        </CardContent>
      </Card>

      {/* Per-Stock Sentiment (only shown when multiple stocks) */}
      {selectedStocks.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.labels.perStockSentiment')}</CardTitle>
            <CardDescription>{t('detail.labels.perStockSentimentDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedStocks.map((stock) => (
              <div key={stock.id} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm font-medium">{stock.ticker}</span>
                <SentimentSelector
                  value={stockSentiments[stock.ticker] ?? null}
                  onChange={(val) =>
                    setStockSentiments((prev) => ({ ...prev, [stock.ticker]: val }))
                  }
                  shortLabel
                  showIcon={false}
                />
                {stockSentiments[stock.ticker] !== undefined && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground h-7 px-2 text-xs"
                    onClick={() =>
                      setStockSentiments((prev) => {
                        const next = { ...prev };
                        delete next[stock.ticker];
                        return next;
                      })
                    }
                  >
                    {t('detail.labels.clearSentiment')}
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* AI Argument Analysis — placeholder while feature is under development */}
      <ArgumentPlaceholder />

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
        defaultName={stockDialogDefaultName}
        defaultMarket={stockDialogDefaultMarket}
        onSuccess={handleStockCreated}
      />

      {/* Publish Confirmation Dialog */}
      <Dialog
        open={publishDialogOpen}
        onOpenChange={(open) => {
          setPublishDialogOpen(open);
          if (!open) setDisclaimerAccepted(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('detail.publishDialog.title')}</DialogTitle>
            <DialogDescription>{t('detail.publishDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!canPublish && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">
                  {t('detail.publishDialog.validationTitle')}
                </p>
                <ul className="mt-1 list-inside list-disc text-sm text-amber-700">
                  {validationErrors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
            {canPublish && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-16 text-sm">
                    {t('detail.publishDialog.labelKol')}
                  </span>
                  <span className="text-sm font-medium">{selectedKOL?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-16 text-sm">
                    {t('detail.publishDialog.labelStocks')}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {selectedStocks.map((s) => {
                      const perStock = stockSentiments[s.ticker];
                      return (
                        <Badge key={s.id} variant="secondary">
                          {s.ticker}
                          {perStock !== undefined && perStock !== sentiment && (
                            <span className="ml-1 opacity-70">
                              ({tCommon(`sentiment.${sentimentKey(perStock)}`)})
                            </span>
                          )}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-16 text-sm">
                    {t('detail.publishDialog.labelSentiment')}
                  </span>
                  <span className="text-sm font-medium">
                    {tCommon(`sentiment.${sentimentKey(sentiment!)}`)}
                  </span>
                </div>
                {duplicateCheck?.isDuplicate && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <p className="text-sm text-amber-700">
                      {t('detail.publishDialog.duplicateWarning')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Disclaimer checkbox */}
          {canPublish && (
            <div className="border-muted rounded-md border p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={disclaimerAccepted}
                  onCheckedChange={(v) => setDisclaimerAccepted(v === true)}
                  className="mt-0.5"
                />
                <div className="text-sm leading-relaxed">
                  <span className="font-medium">{t('detail.publishDialog.disclaimer')}</span>
                  <ol className="text-muted-foreground mt-1 list-inside list-decimal space-y-0.5">
                    <li>{t('detail.publishDialog.disclaimerItems.notPaywalled')}</li>
                    <li>{t('detail.publishDialog.disclaimerItems.noLiability')}</li>
                    <li>{t('detail.publishDialog.disclaimerItems.userResponsibility')}</li>
                  </ol>
                </div>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>
              {t('detail.publishDialog.cancel')}
            </Button>
            <Button
              onClick={handlePublish}
              disabled={!canPublish || !disclaimerAccepted || isPublishing}
            >
              {isPublishing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('detail.publishDialog.publishing')}
                </>
              ) : (
                t('detail.publishDialog.confirmPublish')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* URL Fetch Result Dialog */}
      <Dialog open={fetchDialogOpen} onOpenChange={setFetchDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('detail.fetch.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('detail.fetch.dialogDescription')}</DialogDescription>
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
                <Label className="font-medium">{t('detail.fetch.fieldContent')}</Label>
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
                  <Label className="font-medium">
                    {t('detail.fetch.fieldImages', { count: fetchResult.images.length })}
                  </Label>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {fetchResult.images.slice(0, 4).map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt={t('detail.fetch.fetchedImage', { index: i + 1 })}
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
                  <Label className="font-medium">{t('detail.fetch.fieldPostedAt')}</Label>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {new Date(fetchResult.postedAt).toLocaleString(locale)}
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
                  <Label className="font-medium">{t('detail.fetch.fieldKolName')}</Label>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {fetchResult.kolName}
                    {t('detail.fetch.fieldKolNameNote')}
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFetchDialogOpen(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button onClick={handleApplyFetchResult} disabled={updateDraft.isPending}>
              {updateDraft.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('detail.fetch.applying')}
                </>
              ) : (
                t('detail.fetch.applySelected')
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
  const t = useTranslations('drafts');
  const { data: draft, isLoading, error } = useDraft(id);

  if (isLoading || (!draft && !error)) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="text-muted-foreground">{t('detail.loading')}</p>
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="text-destructive">{t('detail.loadFailed')}</p>
        <Button variant="outline" asChild>
          <Link href={ROUTES.DRAFTS}>{t('detail.backToDrafts')}</Link>
        </Button>
      </div>
    );
  }

  // 使用 draft.id 作為 key 來確保表單在 draft 改變時重新初始化
  return <DraftEditForm key={draft.id} draft={draft} id={id} />;
}
