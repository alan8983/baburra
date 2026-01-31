'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ROUTES } from '@/lib/constants';

// 模擬草稿資料
const mockDrafts = [
  {
    id: '1',
    preview: 'TSLA 相關 - 特斯拉最新財報分析...',
    updatedAt: '2小時前',
  },
  {
    id: '2',
    preview: 'AAPL 相關 - Apple Vision Pro 評測...',
    updatedAt: '昨天',
  },
  {
    id: '3',
    preview: 'NVDA 相關 - AI 晶片需求持續強勁...',
    updatedAt: '3天前',
  },
];

export default function InputPage() {
  const [content, setContent] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleSaveDraft = async () => {
    // TODO: 實作儲存草稿功能
    console.log('Save draft:', content);
  };

  const handleDirectCreate = async () => {
    // TODO: 實作直接建檔功能
    setIsAnalyzing(true);
    // 模擬 AI 分析
    setTimeout(() => {
      setIsAnalyzing(false);
      // 導向預覽確認頁
    }, 2000);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Page Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">快速輸入</h1>
        <p className="mt-2 text-muted-foreground">
          貼上 KOL 的投資觀點文章，快速收錄到資料庫
        </p>
      </div>

      {/* Input Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            輸入文章內容
          </CardTitle>
          <CardDescription>
            貼上文章內容或網址，系統會自動識別 KOL 和投資標的
          </CardDescription>
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
                <Sparkles className="h-4 w-4 text-primary" />
                AI 自動識別結果 (預覽)
              </div>
              <div className="mt-2 grid gap-2 text-sm text-muted-foreground">
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
              disabled={!content.trim()}
            >
              儲存為草稿
            </Button>
            <Button
              onClick={handleDirectCreate}
              disabled={!content.trim() || isAnalyzing}
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
          {mockDrafts.length > 0 ? (
            <div className="space-y-2">
              {mockDrafts.map((draft) => (
                <Link
                  key={draft.id}
                  href={ROUTES.DRAFT_DETAIL(draft.id)}
                  className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <span className="truncate text-sm">{draft.preview}</span>
                  <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                    {draft.updatedAt}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              還沒有草稿
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tips */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <h3 className="font-medium">使用提示</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
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
