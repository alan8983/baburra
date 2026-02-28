'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/infrastructure/supabase/client';
import { ImportLoadingOverlay } from '@/components/import/import-loading-overlay';
import { StepIntro } from '@/components/onboarding/step-intro';
import { StepImport } from '@/components/onboarding/step-import';
import { useImportBatch, type ImportBatchResult } from '@/hooks/use-import';
import { ROUTES, API_ROUTES } from '@/lib/constants';
import { getVariantFromCookie, AB_EXPERIMENTS } from '@/lib/ab-test';
import { toast } from 'sonner';

type WelcomeStep = 1 | 2 | 'register';

export default function WelcomePage() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState<WelcomeStep>(1);
  const [importResult, setImportResult] = useState<ImportBatchResult | null>(null);
  const [importDone, setImportDone] = useState(false);
  const [anonReady, setAnonReady] = useState(false);
  const importBatch = useImportBatch();

  const variant = getVariantFromCookie();

  // Track AB event (fire-and-forget)
  const trackEvent = useCallback(
    async (event: string, metadata?: Record<string, unknown>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      try {
        await fetch(API_ROUTES.AB_EVENTS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            experiment: AB_EXPERIMENTS.ONBOARDING_BEFORE_REG,
            variant: variant || 'B',
            anonymousId: user?.id,
            event,
            metadata,
          }),
        });
      } catch {
        /* non-critical */
      }
    },
    [supabase, variant]
  );

  // Ensure anonymous session exists
  useEffect(() => {
    let cancelled = false;

    async function ensureAnonymousSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.error('Anonymous sign-in failed:', error.message);
        }
      }

      if (!cancelled) {
        setAnonReady(true);
        trackEvent('welcome_viewed');
      }
    }

    ensureAnonymousSession();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const handleImportSubmit = async (urls: string[]) => {
    try {
      const result = await importBatch.mutateAsync({ urls });
      setImportResult(result);
      setImportDone(true);

      trackEvent('import_completed', { importCount: result.totalImported });

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

  const handleProceedToRegister = useCallback(() => {
    trackEvent('registration_started');
    router.push(`${ROUTES.REGISTER}?from=welcome`);
  }, [trackEvent, router]);

  // Show loading while anonymous session is being created
  if (!anonReady) {
    return (
      <div className="flex items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-6">
      {/* Step 1: Product Introduction */}
      {step === 1 && <StepIntro onNext={() => setStep(2)} onSkip={handleProceedToRegister} />}

      {/* Step 2: Import KOL Posts */}
      {step === 2 && (
        <StepImport
          onBack={() => setStep(1)}
          onNext={handleProceedToRegister}
          onSkip={handleProceedToRegister}
          importResult={importResult}
          importDone={importDone}
          onImportSubmit={handleImportSubmit}
          onImportMore={() => setImportDone(false)}
          isImporting={importBatch.isPending}
        />
      )}

      {/* Step Indicator */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-2 w-2 rounded-full transition-colors ${
                s === step ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          {t('stepIndicator', { current: step, total: 2 })}
        </p>
      </div>

      <ImportLoadingOverlay isVisible={importBatch.isPending} />
    </div>
  );
}
