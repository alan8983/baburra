'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ArrowRight, Import, Lightbulb } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ImportForm } from '@/components/import/import-form';
import { ImportResult } from '@/components/import/import-result';
import type { ImportBatchResult } from '@/hooks/use-import';

interface StepImportProps {
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  importResult: ImportBatchResult | null;
  importDone: boolean;
  onImportSubmit: (urls: string[]) => Promise<void>;
  onImportMore: () => void;
  isImporting: boolean;
}

export function StepImport({
  onBack,
  onNext,
  onSkip,
  importResult,
  importDone,
  onImportSubmit,
  onImportMore,
  isImporting,
}: StepImportProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t('step2.title')}</h1>
        <p className="text-muted-foreground mt-2">{t('step2.description')}</p>
      </div>

      <Badge variant="secondary" className="mx-auto flex w-fit gap-1 px-3 py-1">
        <Import className="h-3 w-3" />
        {t('step2.freeQuota')}
      </Badge>

      {!importDone && (
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2">
              <Lightbulb className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="text-muted-foreground mb-1.5 text-sm font-medium">
                  {t('step2.guidanceTitle')}
                </p>
                <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
                  <li>{t('step2.guidancePattern1')}</li>
                  <li>{t('step2.guidancePattern2')}</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!importDone ? (
        <ImportForm onSubmit={onImportSubmit} isLoading={isImporting} />
      ) : (
        importResult && <ImportResult result={importResult} onImportMore={onImportMore} />
      )}

      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t('step2.back')}
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          {t('step2.skip')}
        </Button>
        {importDone && (
          <Button onClick={onNext}>
            {t('step2.next')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
