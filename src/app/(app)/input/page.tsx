'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ROUTES } from '@/lib/constants';
import { useQuickInput } from '@/hooks';
import { AnalysisLoadingOverlay } from '@/components/loading/analysis-loading-overlay';
import { toast } from 'sonner';

export default function InputPage() {
  const t = useTranslations('input');
  const router = useRouter();
  const [content, setContent] = useState('');

  const quickInput = useQuickInput();

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
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4">
      <div className="w-full max-w-2xl space-y-4">
        {/* Page Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('description')}</p>
        </div>

        {/* Input Area */}
        <Textarea
          placeholder={t('inputCard.placeholder')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[200px] resize-none"
        />

        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs">{t('tips.hint')}</p>
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
      </div>

      <AnalysisLoadingOverlay isVisible={quickInput.isPending} />
    </div>
  );
}
