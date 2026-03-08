'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ROUTES } from '@/lib/constants';
import { useQuickInput } from '@/hooks';
import { useImportBatch, type ImportBatchResult } from '@/hooks/use-import';
import { AnalysisLoadingOverlay } from '@/components/loading/analysis-loading-overlay';
import { ImportForm } from '@/components/import/import-form';
import { ImportResult } from '@/components/import/import-result';
import { ImportLoadingOverlay } from '@/components/import/import-loading-overlay';
import { InputWizardStepper, type WizardStep } from '@/components/input/input-wizard-stepper';
import { toast } from 'sonner';

type InputMethod = 'text' | 'urls';

interface WizardState {
  step: WizardStep;
  method: InputMethod | null;
  // Text input result
  draftId: string | null;
  // URL import result
  importResult: ImportBatchResult | null;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  method: null,
  draftId: null,
  importResult: null,
};

export default function InputPage() {
  const t = useTranslations('input');
  const router = useRouter();
  const [content, setContent] = useState('');
  const [wizard, setWizard] = useState<WizardState>(INITIAL_STATE);

  const quickInput = useQuickInput();
  const importBatch = useImportBatch();

  const handleTextSubmit = useCallback(async () => {
    if (!content.trim()) return;
    setWizard((prev) => ({ ...prev, method: 'text', step: 2 }));
    try {
      const result = await quickInput.mutateAsync(content.trim());
      setContent('');
      if (result.warning === 'no_tickers_identified') {
        toast.warning(t('warnings.noTickersIdentified'), {
          description: t('warnings.noTickersIdentifiedHint'),
        });
      }
      // Text analysis is fast — skip to review (step 3) then auto-advance to complete
      setWizard((prev) => ({
        ...prev,
        draftId: result.draft.id,
        step: 4,
      }));
    } catch (error) {
      toast.error(t('errors.createDraftFailed'), {
        description: error instanceof Error ? error.message : t('errors.tryAgain'),
      });
      // Go back to step 1 on error
      setWizard(INITIAL_STATE);
    }
  }, [content, quickInput, t]);

  const handleImportSubmit = useCallback(
    async (urls: string[]) => {
      setWizard((prev) => ({ ...prev, method: 'urls', step: 2 }));
      try {
        const result = await importBatch.mutateAsync({ urls });
        // Show review step with results
        setWizard((prev) => ({
          ...prev,
          importResult: result,
          step: 3,
        }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Import failed');
        setWizard(INITIAL_STATE);
      }
    },
    [importBatch]
  );

  const handleAdvanceToComplete = useCallback(() => {
    setWizard((prev) => ({ ...prev, step: 4 }));
  }, []);

  const handleReset = useCallback(() => {
    setContent('');
    setWizard(INITIAL_STATE);
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center px-4 pt-8">
      <div className="w-full max-w-2xl space-y-8">
        {/* Stepper Header */}
        <InputWizardStepper currentStep={wizard.step} />

        {/* Step 1: Input */}
        {wizard.step === 1 && (
          <StepInput
            content={content}
            onContentChange={setContent}
            onTextSubmit={handleTextSubmit}
            onImportSubmit={handleImportSubmit}
            isTextPending={quickInput.isPending}
            isImportPending={importBatch.isPending}
            t={t}
          />
        )}

        {/* Step 2: Processing — shown via overlays, this is a transition state */}
        {wizard.step === 2 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Loader2 className="text-primary h-8 w-8 animate-spin" />
              <h2 className="mt-4 text-lg font-semibold">{t('wizard.processingTitle')}</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('wizard.processingDescription')}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review Results */}
        {wizard.step === 3 && wizard.importResult && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold">{t('wizard.reviewTitle')}</h2>
              <p className="text-muted-foreground mt-1 text-sm">{t('wizard.reviewDescription')}</p>
            </div>
            <ImportResult
              result={wizard.importResult}
              onImportMore={handleReset}
              onProceed={handleAdvanceToComplete}
              proceedLabel={t('wizard.viewPosts')}
            />
          </div>
        )}

        {/* Step 4: Complete */}
        {wizard.step === 4 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <h2 className="mt-4 text-xl font-semibold">{t('wizard.completeTitle')}</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('wizard.completeDescription')}
              </p>

              {/* Summary */}
              <p className="mt-4 text-sm">
                {wizard.method === 'text'
                  ? t('wizard.summaryDraft')
                  : wizard.importResult
                    ? t('wizard.summary', { count: wizard.importResult.totalImported })
                    : ''}
              </p>

              {/* CTAs */}
              <div className="mt-6 flex gap-3">
                {wizard.method === 'text' && wizard.draftId && (
                  <Button onClick={() => router.push(ROUTES.DRAFT_DETAIL(wizard.draftId!))}>
                    {t('wizard.viewDraft')}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
                {wizard.method === 'urls' && (
                  <Button onClick={() => router.push(ROUTES.POSTS)}>
                    {t('wizard.viewPosts')}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
                <Button variant="outline" onClick={handleReset}>
                  <RotateCcw className="mr-1 h-4 w-4" />
                  {t('wizard.importMore')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Loading overlays */}
      <AnalysisLoadingOverlay isVisible={wizard.step === 2 && wizard.method === 'text'} />
      <ImportLoadingOverlay isVisible={wizard.step === 2 && wizard.method === 'urls'} />
    </div>
  );
}

function StepInput({
  content,
  onContentChange,
  onTextSubmit,
  onImportSubmit,
  isTextPending,
  isImportPending,
  t,
}: {
  content: string;
  onContentChange: (value: string) => void;
  onTextSubmit: () => void;
  onImportSubmit: (urls: string[]) => void;
  isTextPending: boolean;
  isImportPending: boolean;
  t: ReturnType<typeof useTranslations<'input'>>;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
      </div>

      <Tabs defaultValue="text" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="text">{t('wizard.tabText')}</TabsTrigger>
          <TabsTrigger value="urls">{t('wizard.tabUrls')}</TabsTrigger>
        </TabsList>

        {/* Plain Text Tab */}
        <TabsContent value="text" className="mt-4 space-y-3">
          <Textarea
            placeholder={t('inputCard.placeholder')}
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            className="min-h-[200px] resize-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">{t('tips.hint')}</p>
            <Button onClick={onTextSubmit} disabled={!content.trim() || isTextPending} size="lg">
              {isTextPending ? (
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
        </TabsContent>

        {/* URL Import Tab */}
        <TabsContent value="urls" className="mt-4">
          <ImportForm onSubmit={onImportSubmit} isLoading={isImportPending} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
