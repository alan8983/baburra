'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  BarChart3,
  TrendingUp,
  Bot,
  LineChart,
  ArrowRight,
  ChevronLeft,
  CheckCircle2,
  Import,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ImportForm } from '@/components/import/import-form';
import { ImportResult } from '@/components/import/import-result';
import { ImportLoadingOverlay } from '@/components/import/import-loading-overlay';
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

  const handleImportSubmit = async (kolName: string, urls: string[]) => {
    try {
      const result = await importBatch.mutateAsync({ kolName, urls });
      setImportResult(result);
      setImportDone(true);

      if (result.totalImported > 0) {
        toast.success(
          t('step3.importedSummary', {
            count: result.totalImported,
            kolName: result.kolName,
          })
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    }
  };

  const handleComplete = useCallback(
    async (destination: 'kol' | 'dashboard') => {
      await completeOnboarding();

      if (destination === 'kol' && importResult) {
        router.push(ROUTES.KOL_DETAIL(importResult.kolId));
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
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight">{t('step1.title')}</h1>
            </div>

            <Card>
              <CardContent className="space-y-4 pt-6">
                <FeatureItem
                  icon={<BarChart3 className="h-5 w-5 text-blue-500" />}
                  text={t('step1.features.track')}
                />
                <FeatureItem
                  icon={<TrendingUp className="h-5 w-5 text-green-500" />}
                  text={t('step1.features.measure')}
                />
                <FeatureItem
                  icon={<Bot className="h-5 w-5 text-purple-500" />}
                  text={t('step1.features.ai')}
                />
                <FeatureItem
                  icon={<LineChart className="h-5 w-5 text-orange-500" />}
                  text={t('step1.features.chart')}
                />
              </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-3">
              <Button onClick={() => setStep(2)} size="lg">
                {t('step1.getStarted')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={handleSkipToEnd}>
                {t('step1.skip')}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Import KOL Posts */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight">{t('step2.title')}</h1>
              <p className="text-muted-foreground mt-2">{t('step2.description')}</p>
            </div>

            <Badge variant="secondary" className="mx-auto flex w-fit gap-1 px-3 py-1">
              <Import className="h-3 w-3" />
              {t('step2.freeQuota')}
            </Badge>

            {!importDone ? (
              <ImportForm onSubmit={handleImportSubmit} isLoading={importBatch.isPending} />
            ) : (
              importResult && (
                <ImportResult result={importResult} onImportMore={() => setImportDone(false)} />
              )
            )}

            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t('step2.back')}
              </Button>
              <Button variant="ghost" onClick={handleSkipToEnd}>
                {t('step2.skip')}
              </Button>
              {importDone && (
                <Button onClick={() => setStep(3)}>
                  {t('step2.next')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
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
                          {t('step3.importedSummary', {
                            count: importResult.totalImported,
                            kolName: importResult.kolName,
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
              {importResult && importResult.totalImported > 0 && (
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

function FeatureItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}
