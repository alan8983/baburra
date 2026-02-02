'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileText, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ROUTES } from '@/lib/constants';
import { useDrafts, useCreateDraft } from '@/hooks';
import { formatRelativeTime } from '@/lib/utils/date';

export default function InputPage() {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 使用 API 取得最近草稿
  const { data: draftsData, isLoading: draftsLoading } = useDrafts({ limit: 3 });
  const createDraft = useCreateDraft();

  const recentDrafts = draftsData?.data ?? [];

  const handleSaveDraft = async () => {
    if (!content.trim()) return;
    try {
      const newDraft = await createDraft.mutateAsync({
        content: content.trim(),
      });
      setContent('');
      // 導向草稿編輯頁
      router.push(ROUTES.DRAFT_DETAIL(newDraft.id));
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  };

  const handleDirectCreate = async () => {
    if (!content.trim()) return;
    setIsAnalyzing(true);
    try {
      // 先建立草稿
      const newDraft = await createDraft.mutateAsync({
        content: content.trim(),
      });
      setContent('');
      // 導向草稿編輯頁（未來可直接導向預覽確認頁）
      router.push(ROUTES.DRAFT_DETAIL(newDraft.id));
    } catch (error) {
      console.error('Failed to create draft:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Page Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">快速輸入</h1>
        <p className="text-muted-foreground mt-2">貼上 KOL 的投資觀點文章，快速收錄到資料庫</p>
      </div>

      {/* Input Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            輸入文章內容
          </CardTitle>
          <CardDescription>貼上文章內容或網址，系統會自動識別 KOL 和投資標的</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="貼上 KOL 的發文內容或文章網址...

例如：
- 直接貼上 Facebook / Twitter 貼文內容
- 貼上文章網址 (支援自動擷取)
- 手動輸入觀點摘要"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[200px] resize-none"
          />

          {/* AI Detection Preview */}
          {content.length > 50 && (
            <div className="rounded-lg border border-dashed p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="text-primary h-4 w-4" />
                AI 自動識別結果 (預覽)
              </div>
              <div className="text-muted-foreground mt-2 grid gap-2 text-sm">
                <div>
                  <span className="font-medium">KOL: </span>
                  <span className="text-foreground">待識別...</span>
                </div>
                <div>
                  <span className="font-medium">標的: </span>
                  <span className="text-foreground">AAPL, TSLA</span>
                </div>
                <div>
                  <span className="font-medium">情緒: </span>
                  <span className="text-green-600">看多</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={!content.trim() || createDraft.isPending}
            >
              {createDraft.isPending && !isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  儲存中...
                </>
              ) : (
                '儲存為草稿'
              )}
            </Button>
            <Button
              onClick={handleDirectCreate}
              disabled={!content.trim() || isAnalyzing || createDraft.isPending}
            >
              {isAnalyzing ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                  AI 分析中...
                </>
              ) : (
                <>
                  直接建檔
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Drafts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">最近草稿</CardTitle>
            <CardDescription>點擊繼續編輯</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href={ROUTES.DRAFTS}>
              查看全部
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {draftsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
              <span className="text-muted-foreground ml-2 text-sm">載入中...</span>
            </div>
          ) : recentDrafts.length > 0 ? (
            <div className="space-y-2">
              {recentDrafts.map((draft) => {
                const preview = draft.content
                  ? draft.content.slice(0, 50) + (draft.content.length > 50 ? '...' : '')
                  : '（尚無內容）';
                const stockTickers = draft.stocks.map((s) => s.ticker).join(', ');
                const displayText = stockTickers ? `${stockTickers} - ${preview}` : preview;
                return (
                  <Link
                    key={draft.id}
                    href={ROUTES.DRAFT_DETAIL(draft.id)}
                    className="hover:bg-muted/50 flex items-center justify-between rounded-lg border p-3 transition-colors"
                  >
                    <span className="truncate text-sm">{displayText}</span>
                    <span className="text-muted-foreground ml-4 shrink-0 text-xs">
                      {formatRelativeTime(draft.updatedAt)}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center text-sm">還沒有草稿</p>
          )}
        </CardContent>
      </Card>

      {/* Tips */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <h3 className="font-medium">使用提示</h3>
          <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
            <li>• 支援直接貼上 Facebook、Twitter 的貼文內容</li>
            <li>• 系統會自動識別文章中提及的股票代碼</li>
            <li>• AI 會分析文章情緒，但您可以在確認前調整</li>
            <li>• 如果文章網址已存在，系統會提醒您</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
