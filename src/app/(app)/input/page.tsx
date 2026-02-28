'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ROUTES } from '@/lib/constants';
import { useQuickInput } from '@/hooks';
import { useImportBatch, type ImportBatchResult } from '@/hooks/use-import';
import { AnalysisLoadingOverlay } from '@/components/loading/analysis-loading-overlay';
import { ImportForm } from '@/components/import/import-form';
import { ImportResult } from '@/components/import/import-result';
import { ImportLoadingOverlay } from '@/components/import/import-loading-overlay';
import { toast } from 'sonner';

export default function InputPage() {
  const t = useTranslations('input');
  const router = useRouter();
  const [content, setContent] = useState('');

  const quickInput = useQuickInput();

  // URL import state
  const importBatch = useImportBatch();
  const [importResult, setImportResult] = useState<ImportBatchResult | null>(null);
  const [importDone, setImportDone] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    try {
      const result = await quickInput.mutateAsync(content.trim());
      setContent('');
      if (result.warning === 'no_tickers_identified') {
        toast.warning(t('warnings.noTickersIdentified'), {
          description: t('warnings.noTickersIdentifiedHint'),
        });
      }
      router.push(ROUTES.DRAFT_DETAIL(result.draft.id));
    } catch (error) {
      toast.error(t('errors.createDraftFailed'), {
        description: error instanceof Error ? error.message : t('errors.tryAgain'),
      });
    }
  };

  const handleImportSubmit = async (urls: string[]) => {
    try {
      const result = await importBatch.mutateAsync({ urls });
      setImportResult(result);
      setImportDone(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4">
      <div className="w-full max-w-5xl space-y-6">
        {/* Page Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('description')}</p>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left column: URL Import */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{t('urlImport.sectionTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('urlImport.sectionDescription')}</p>

            {!importDone ? (
              <ImportForm onSubmit={handleImportSubmit} isLoading={importBatch.isPending} />
            ) : (
              importResult && (
                <ImportResult
                  result={importResult}
                  onImportMore={() => {
                    setImportDone(false);
                    setImportResult(null);
                  }}
                  onProceed={() => router.push(ROUTES.POSTS)}
                  proceedLabel={t('urlImport.viewPosts')}
                />
              )
            )}
          </div>

          {/* Right column: Plain Text Input */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{t('inputCard.placeholder')}</h2>

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
        </div>
      </div>

      <AnalysisLoadingOverlay isVisible={quickInput.isPending} />
      <ImportLoadingOverlay isVisible={importBatch.isPending} />
    </div>
  );
}
