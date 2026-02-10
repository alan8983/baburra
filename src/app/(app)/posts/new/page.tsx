'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { SentimentSelector } from '@/components/forms/sentiment-selector';
import { ROUTES } from '@/lib/constants';
import { useDraft, useDeleteDraft } from '@/hooks/use-drafts';
import { useCreatePost, useCheckDuplicateUrl } from '@/hooks/use-posts';
import { useAnalyzeSentiment, useExtractArguments, useAiUsage } from '@/hooks/use-ai';
import type { Sentiment, CreatePostInput } from '@/domain/models';
import { detectPlatform } from '@/lib/utils/format';
import { toast } from 'sonner';

function PostNewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draftId');

  // 取得草稿資料
  const { data: draft, isLoading: isDraftLoading, error: draftError } = useDraft(draftId ?? '');
  const deleteDraft = useDeleteDraft();
  const createPost = useCreatePost();

  // AI hooks
  const { data: aiUsage } = useAiUsage();
  const analyzeSentiment = useAnalyzeSentiment();
  const extractArguments = useExtractArguments();

  // 狀態
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<Sentiment | null>(null);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [extractArgsOnPublish, setExtractArgsOnPublish] = useState(true);

  // 重複 URL 檢測
  const sourceUrl = draft?.sourceUrl ?? '';
  const { data: duplicateCheck } = useCheckDuplicateUrl(sourceUrl);

  // 初始化 sentiment
  useEffect(() => {
    if (draft?.sentiment !== undefined && draft?.sentiment !== null) {
      setSentiment(draft.sentiment as Sentiment);
    }
  }, [draft]);

  // AI 情緒分析
  const handleAnalyzeSentiment = useCallback(async () => {
    if (!draft?.content) return;

    try {
      const result = await analyzeSentiment.mutateAsync(draft.content);
      setAiSuggestion(result.sentiment);
      setAiReasoning(result.reasoning);
      setAiConfidence(result.confidence);
    } catch (error) {
      toast.error('AI 分析失敗', {
        description: error instanceof Error ? error.message : '請稍後再試',
      });
    }
  }, [draft?.content, analyzeSentiment]);

  // 採用 AI 建議
  const handleAcceptAiSuggestion = () => {
    if (aiSuggestion !== null) {
      setSentiment(aiSuggestion);
    }
  };

  // 發布文章
  const handlePublish = async () => {
    if (!draft || !sentiment) return;
    if (!draft.kolId) {
      toast.error('請選擇 KOL');
      return;
    }
    if (!draft.stocks || draft.stocks.length === 0) {
      toast.error('請選擇至少一個投資標的');
      return;
    }
    if (!draft.content) {
      toast.error('請填寫主文內容');
      return;
    }
    if (!draft.postedAt) {
      toast.error('請選擇發文時間');
      return;
    }

    setIsPublishing(true);
    try {
      // 建立文章
      const input: CreatePostInput = {
        kolId: draft.kolId,
        stockIds: draft.stocks.map((s) => s.id),
        content: draft.content,
        sourceUrl: draft.sourceUrl || undefined,
        sourcePlatform: detectPlatform(draft.sourceUrl),
        images: draft.images || [],
        sentiment,
        sentimentAiGenerated: sentiment === aiSuggestion,
        postedAt: new Date(draft.postedAt),
      };

      const post = await createPost.mutateAsync(input);

      // 論點提取（如果啟用且有配額）
      if (extractArgsOnPublish && aiUsage && aiUsage.remaining > 0 && draft.stocks.length > 0) {
        try {
          await extractArguments.mutateAsync({
            content: draft.content,
            postId: post.id,
            stocks: draft.stocks.map((s) => ({
              id: s.id,
              ticker: s.ticker,
              name: s.name,
            })),
          });
          toast.success('文章發布成功，已提取論點');
        } catch {
          // 論點提取失敗不影響主流程
          toast.success('文章發布成功', {
            description: '論點提取失敗，可稍後手動提取',
          });
        }
      } else {
        toast.success('文章發布成功');
      }

      // 刪除草稿
      await deleteDraft.mutateAsync(draftId!);

      // 導航到文章詳情頁
      router.push(ROUTES.POST_DETAIL(post.id));
    } catch (error) {
      toast.error('發布失敗', {
        description: error instanceof Error ? error.message : '請稍後再試',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // 檢查是否可以發布
  const canPublish =
    draft &&
    draft.kolId &&
    draft.stocks &&
    draft.stocks.length > 0 &&
    draft.content &&
    draft.postedAt &&
    sentiment !== null;

  // Loading 狀態
  if (!draftId) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="text-muted-foreground">缺少草稿 ID，請從草稿編輯頁進入</p>
        <Button variant="outline" asChild>
          <Link href={ROUTES.DRAFTS}>返回草稿列表</Link>
        </Button>
      </div>
    );
  }

  if (isDraftLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          載入中...
        </div>
      </div>
    );
  }

  if (draftError || !draft) {
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
          <Link href={ROUTES.DRAFT_DETAIL(draftId)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回編輯
          </Link>
        </Button>
      </div>

      {/* 重複 URL 警告 */}
      {sourceUrl && duplicateCheck?.isDuplicate && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-medium text-amber-800">此文章網址已存在於資料庫中</p>
              <p className="text-sm text-amber-700">
                建立於{' '}
                {format(new Date(duplicateCheck.existingPost!.createdAt), 'yyyy/MM/dd', {
                  locale: zhTW,
                })}
              </p>
              <Button variant="link" size="sm" className="h-auto p-0 text-amber-700" asChild>
                <Link href={ROUTES.POST_DETAIL(duplicateCheck.existingPost!.id)}>
                  查看現有文章 →
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 文章預覽 */}
      <Card>
        <CardHeader>
          <CardTitle>文章預覽</CardTitle>
          <CardDescription>請確認文章內容無誤後再發布</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* KOL 資訊 */}
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={draft.kol?.avatarUrl ?? undefined} />
              <AvatarFallback>{draft.kol?.name?.slice(0, 2) ?? '?'}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="font-semibold">{draft.kol?.name ?? '未選擇 KOL'}</p>
              <p className="text-muted-foreground text-sm">
                {draft.postedAt
                  ? format(new Date(draft.postedAt), 'yyyy/MM/dd HH:mm', { locale: zhTW })
                  : '未設定發文時間'}
              </p>
              <div className="flex flex-wrap gap-1">
                {draft.stocks?.map((stock) => (
                  <Badge key={stock.id} variant="secondary">
                    {stock.ticker}
                  </Badge>
                ))}
                {(!draft.stocks || draft.stocks.length === 0) && (
                  <span className="text-muted-foreground text-sm">未選擇標的</span>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* 主文內容 */}
          <div className="space-y-2">
            <h4 className="text-muted-foreground text-sm font-medium">主文內容</h4>
            <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap">
              {draft.content || '（無內容）'}
            </div>
          </div>

          {/* 圖片 */}
          {draft.images && draft.images.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-muted-foreground text-sm font-medium">
                  附圖 ({draft.images.length})
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {draft.images.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`附圖 ${i + 1}`}
                      className="aspect-square rounded-lg object-cover"
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 原始網址 */}
          {draft.sourceUrl && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-muted-foreground text-sm font-medium">原始網址</h4>
                <a
                  href={draft.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-sm hover:underline"
                >
                  {draft.sourceUrl}
                </a>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 情緒選擇 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>
              走勢情緒 <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>選擇這篇文章的整體看法方向</CardDescription>
          </div>
          {/* AI 分析按鈕 */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyzeSentiment}
            disabled={
              !draft.content || analyzeSentiment.isPending || (aiUsage?.remaining ?? 0) <= 0
            }
          >
            {analyzeSentiment.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                AI 分析
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <SentimentSelector
            value={sentiment}
            onChange={setSentiment}
            showIcon
            aiSuggestion={aiSuggestion}
            onAcceptAiSuggestion={handleAcceptAiSuggestion}
          />

          {/* AI 分析結果詳情 */}
          {aiReasoning && aiConfidence !== null && (
            <div className="border-primary/20 bg-primary/5 rounded-lg border p-4 text-sm">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="text-primary h-4 w-4" />
                <span className="font-medium">AI 分析結果</span>
                <span className="text-muted-foreground">
                  (信心度: {Math.round(aiConfidence * 100)}%)
                </span>
              </div>
              <p className="text-muted-foreground">{aiReasoning}</p>
            </div>
          )}

          {/* AI 配額提示 */}
          {aiUsage && (
            <p className="text-muted-foreground text-xs">
              AI 配額：{aiUsage.remaining} / {aiUsage.weeklyLimit} 本週剩餘
            </p>
          )}
        </CardContent>
      </Card>

      {/* 論點提取選項 */}
      <Card>
        <CardContent className="pt-6">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={extractArgsOnPublish}
              onChange={(e) => setExtractArgsOnPublish(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
              disabled={(aiUsage?.remaining ?? 0) <= 0}
            />
            <div>
              <span className="text-sm font-medium">發布後自動提取論點</span>
              <p className="text-muted-foreground text-xs">
                使用 AI 自動分析並提取文章中的投資論點（消耗 1 次 AI 配額）
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* 發布按鈕 */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" asChild>
          <Link href={ROUTES.DRAFT_DETAIL(draftId)}>返回編輯</Link>
        </Button>
        <Button onClick={handlePublish} disabled={!canPublish || isPublishing}>
          {isPublishing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              發布中...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              確認建檔
            </>
          )}
        </Button>
      </div>

      {/* 缺少資訊提示 */}
      {!canPublish && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4">
            <p className="text-sm text-amber-800">請確認以下必填欄位已填寫：</p>
            <ul className="mt-2 list-inside list-disc text-sm text-amber-700">
              {!draft.kolId && <li>KOL</li>}
              {(!draft.stocks || draft.stocks.length === 0) && <li>投資標的</li>}
              {!draft.content && <li>主文內容</li>}
              {!draft.postedAt && <li>發文時間</li>}
              {sentiment === null && <li>走勢情緒</li>}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function PostNewPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            載入中...
          </div>
        </div>
      }
    >
      <PostNewContent />
    </Suspense>
  );
}
