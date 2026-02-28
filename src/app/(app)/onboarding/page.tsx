'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImportLoadingOverlay } from '@/components/import/import-loading-overlay';
import { StepIntro } from '@/components/onboarding/step-intro';
import { StepImport } from '@/components/onboarding/step-import';
import { useImportBatch, type ImportBatchResult } from '@/hooks/use-import';
import { useOnboarding } from '@/hooks/use-onboarding';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';

type OnboardingStep = 1 | 2 | 3;

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const { completeOnboarding } = useOnboarding();

  const [step, setStep] = useState<OnboardingStep>(1);
  const [importResult, setImportResult] = useState<ImportBatchResult | null>(null);
  const [importDone, setImportDone] = useState(false);
  const importBatch = useImportBatch();

  const handleImportSubmit = async (urls: string[]) => {
    try {
      const result = await importBatch.mutateAsync({ urls });
      setImportResult(result);
      setImportDone(true);

      if (result.totalImported > 0) {
        if (result.kols.length === 1) {
          toast.success(
            t('step3.importedSummary', {
              count: result.totalImported,
              kolName: result.kols[0].kolName,
            })
          );
        } else {
          toast.success(
            t('step3.importedSummaryMulti', {
              count: result.totalImported,
              kolCount: result.kols.length,
            })
          );
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    }
  };

  const handleComplete = useCallback(
    async (destination: 'kol' | 'dashboard') => {
      await completeOnboarding();

      if (destination === 'kol' && importResult && importResult.kols.length > 0) {
        router.push(ROUTES.KOL_DETAIL(importResult.kols[0].kolId));
      } else {
        router.push(ROUTES.DASHBOARD);
      }
    },
    [completeOnboarding, importResult, router]
  );

  const handleSkipToEnd = useCallback(() => {
    setImportDone(false);
    setImportResult(null);
    setStep(3);
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Step 1: Product Introduction */}
        {step === 1 && <StepIntro onNext={() => setStep(2)} onSkip={handleSkipToEnd} />}

        {/* Step 2: Import KOL Posts */}
        {step === 2 && (
          <StepImport
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            onSkip={handleSkipToEnd}
            importResult={importResult}
            importDone={importDone}
            onImportSubmit={handleImportSubmit}
            onImportMore={() => setImportDone(false)}
            isImporting={importBatch.isPending}
          />
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight">{t('step3.title')}</h1>
            </div>

            <Card>
              <CardContent className="pt-6">
                {importResult && importResult.totalImported > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
                      <div>
                        <p className="font-medium">
                          {importResult.kols.length === 1
                            ? t('step3.importedSummary', {
                                count: importResult.totalImported,
                                kolName: importResult.kols[0].kolName,
                              })
                            : t('step3.importedSummaryMulti', {
                                count: importResult.totalImported,
                                kolCount: importResult.kols.length,
                              })}
                        </p>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {t('step3.importedDetail')}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center">{t('step3.skippedMessage')}</p>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-3">
              {importResult && importResult.kols.length === 1 && (
                <Button onClick={() => handleComplete('kol')}>
                  {t('step3.viewKol')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              <Button
                variant={importResult?.totalImported ? 'outline' : 'default'}
                onClick={() => handleComplete('dashboard')}
              >
                {t('step3.goToDashboard')}
              </Button>
            </div>
          </div>
        )}

        {/* Step Indicator */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 w-2 rounded-full transition-colors ${
                  s === step ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('stepIndicator', { current: step, total: 3 })}
          </p>
        </div>
      </div>

      <ImportLoadingOverlay isVisible={importBatch.isPending} />
    </div>
  );
}
