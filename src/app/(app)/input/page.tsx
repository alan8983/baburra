'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants';
import { useQuickInput } from '@/hooks';
import { useBackgroundImport, type ImportBatchResult } from '@/hooks/use-import';
import { AnalysisLoadingOverlay } from '@/components/loading/analysis-loading-overlay';
import { ImportResult } from '@/components/import/import-result';
import { InputWizardStepper, type WizardStep } from '@/components/input/input-wizard-stepper';
import { DetectedUrls } from '@/components/input/detected-urls';
import { parseInputContent } from '@/lib/utils/parse-input-content';
import {
  estimateImportTime,
  formatTimeEstimate,
  type UrlEstimateInput,
} from '@/lib/utils/estimate-import-time';
import { CREDIT_COSTS } from '@/domain/models/user';
import { toast } from 'sonner';

const YOUTUBE_URL_PATTERN = /youtube\.com|youtu\.be/i;

type InputMethod = 'text' | 'urls';

const MAX_URLS = 5;

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
  const { startImport } = useBackgroundImport();

  const parsed = useMemo(() => parseInputContent(content), [content]);

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
      setWizard((prev) => ({
        ...prev,
        draftId: result.draft.id,
        step: 4,
      }));
    } catch (error) {
      toast.error(t('errors.createDraftFailed'), {
        description: error instanceof Error ? error.message : t('errors.tryAgain'),
      });
      setWizard(INITIAL_STATE);
    }
  }, [content, quickInput, t]);

  const handleImportSubmit = useCallback(
    (urls: string[]) => {
      // Fire import in background — toast tracks progress
      startImport(urls);
      // Reset form immediately (non-blocking)
      setContent('');
      setWizard(INITIAL_STATE);
      toast.info(t('wizard.importStarted'));
    },
    [startImport, t]
  );

  const handleSubmit = useCallback(() => {
    if (parsed.mode === 'urls') {
      handleImportSubmit(parsed.urls);
    } else if (parsed.mode === 'text') {
      handleTextSubmit();
    }
  }, [parsed, handleImportSubmit, handleTextSubmit]);

  const handleAdvanceToComplete = useCallback(() => {
    setWizard((prev) => ({ ...prev, step: 4 }));
  }, []);

  const handleReset = useCallback(() => {
    setContent('');
    setWizard(INITIAL_STATE);
  }, []);

  const isPending = quickInput.isPending;

  // Compute estimate when URLs are detected
  const urlEstimate = useMemo(() => {
    if (parsed.mode !== 'urls' || parsed.urls.length === 0) return null;
    const urlInputs: UrlEstimateInput[] = parsed.urls.map((url) => ({
      platform: YOUTUBE_URL_PATTERN.test(url) ? 'youtube' : 'twitter',
      hasCaptions: false,
      durationSeconds: null,
    }));
    const { batch } = estimateImportTime(urlInputs);
    let credits = 0;
    for (const input of urlInputs) {
      credits +=
        input.platform === 'youtube'
          ? Math.ceil(600 / 60) * CREDIT_COSTS.video_transcription_per_min
          : CREDIT_COSTS.text_analysis;
    }
    return { credits, time: formatTimeEstimate(batch) };
  }, [parsed]);
  const tooManyUrls = parsed.mode === 'urls' && parsed.urls.length > MAX_URLS;
  const canSubmit =
    parsed.mode !== 'empty' && !isPending && !tooManyUrls && !parsed.hasUnsupportedUrls;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center px-4 pt-8">
      <div className="w-full max-w-2xl space-y-8">
        {/* Stepper Header */}
        <InputWizardStepper currentStep={wizard.step} />

        {/* Step 1: Input */}
        {wizard.step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
              <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
            </div>

            <div className="space-y-3">
              <Textarea
                placeholder={t('inputCard.placeholder')}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[200px] resize-none"
              />

              <DetectedUrls parsed={parsed} />

              {urlEstimate && canSubmit && (
                <p className="text-muted-foreground text-center text-sm">
                  {urlEstimate.credits} credits &middot; {urlEstimate.time}
                </p>
              )}

              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-xs">{t('tips.hint')}</p>
                <Button onClick={handleSubmit} disabled={!canSubmit} size="lg">
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('actions.analyzing')}
                    </>
                  ) : (
                    <>
                      {parsed.mode === 'urls' ? t('actions.importPosts') : t('actions.createDraft')}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
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

      {/* Loading overlay (text input only — import uses background toast) */}
      <AnalysisLoadingOverlay isVisible={wizard.step === 2 && wizard.method === 'text'} />
    </div>
  );
}
