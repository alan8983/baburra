'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, FileText, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ROUTES } from '@/lib/constants';
import { useDrafts, useQuickInput } from '@/hooks';
import { formatRelativeTime } from '@/lib/utils/date';
import { toast } from 'sonner';

export default function InputPage() {
  const t = useTranslations('input');
  const tLimits = useTranslations('input.limitations');
  const router = useRouter();
  const [content, setContent] = useState('');

  const { data: draftsData, isLoading: draftsLoading } = useDrafts({ limit: 3 });
  const quickInput = useQuickInput();

  const recentDrafts = draftsData?.data ?? [];

  const handleSubmit = async () => {
    if (!content.trim()) return;
    try {
      const result = await quickInput.mutateAsync(content.trim());
      setContent('');
      router.push(ROUTES.DRAFT_DETAIL(result.draft.id));
    } catch (error) {
      toast.error(t('errors.createDraftFailed'), {
        description: error instanceof Error ? error.message : t('errors.tryAgain'),
      });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Page Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('description')}</p>
      </div>

      {/* Input Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('inputCard.title')}
          </CardTitle>
          <CardDescription>{t('inputCard.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder={t('inputCard.placeholder')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[200px] resize-none"
          />

          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={!content.trim() || quickInput.isPending}
              size="lg"
            >
              {quickInput.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('actions.analyzing')}
                </>
              ) : (
                <>
                  {t('actions.createDraft')}
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
            <CardTitle className="text-base">{t('recentDrafts.title')}</CardTitle>
            <CardDescription>{t('recentDrafts.clickToContinue')}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href={ROUTES.DRAFTS}>
              {t('recentDrafts.viewAll')}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {draftsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
              <span className="text-muted-foreground ml-2 text-sm">
                {t('recentDrafts.loading')}
              </span>
            </div>
          ) : recentDrafts.length > 0 ? (
            <div className="space-y-2">
              {recentDrafts.map((draft) => {
                const preview = draft.content
                  ? draft.content.slice(0, 50) + (draft.content.length > 50 ? '...' : '')
                  : t('recentDrafts.empty');
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
            <p className="text-muted-foreground text-center text-sm">
              {t('recentDrafts.noDrafts')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tips */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <h3 className="font-medium">{t('tips.title')}</h3>
          <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
            <li>• {t('tips.tip1')}</li>
            <li>• {t('tips.tip2')}</li>
            <li>• {t('tips.tip3')}</li>
          </ul>
        </CardContent>
      </Card>

      {/* Twitter Extraction Limitations */}
      <Card className="border-muted">
        <CardContent className="pt-6">
          <h3 className="flex items-center gap-2 font-medium">
            <Info className="text-muted-foreground h-4 w-4" />
            {tLimits('title')}
          </h3>
          <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
            <li>• {tLimits('textOnly')}</li>
            <li>• {tLimits('singleTweet')}</li>
            <li>• {tLimits('noArticles')}</li>
            <li>• {tLimits('comingSoon')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
