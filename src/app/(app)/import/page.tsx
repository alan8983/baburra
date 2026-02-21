'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImportForm } from '@/components/import/import-form';
import { ImportResult } from '@/components/import/import-result';
import { ImportLoadingOverlay } from '@/components/import/import-loading-overlay';
import { useImportBatch, type ImportBatchResult } from '@/hooks/use-import';
import { toast } from 'sonner';

type PageState = 'form' | 'result';

export default function ImportPage() {
  const t = useTranslations('import');
  const [pageState, setPageState] = useState<PageState>('form');
  const [result, setResult] = useState<ImportBatchResult | null>(null);
  const importBatch = useImportBatch();

  const handleSubmit = async (kolName: string, urls: string[]) => {
    try {
      const batchResult = await importBatch.mutateAsync({ kolName, urls });
      setResult(batchResult);
      setPageState('result');

      if (batchResult.totalImported > 0) {
        toast.success(t('result.imported', { count: batchResult.totalImported }));
      }
    } catch (error) {
      toast.error(t('errors.importFailed'), {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleReset = () => {
    setPageState('form');
    setResult(null);
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4">
      <div className="w-full max-w-2xl space-y-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('description')}</p>
        </div>

        {pageState === 'form' && (
          <ImportForm onSubmit={handleSubmit} isLoading={importBatch.isPending} />
        )}

        {pageState === 'result' && result && (
          <ImportResult result={result} onImportMore={handleReset} />
        )}
      </div>

      <ImportLoadingOverlay isVisible={importBatch.isPending} />
    </div>
  );
}
