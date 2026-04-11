'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { useQuickInput } from '@/hooks';
import { useBackgroundImport } from '@/hooks/use-import';
import {
  useDiscoverProfile,
  useInitiateScrape,
  type DiscoverProfileResult,
} from '@/hooks/use-scrape';
import { useProfile } from '@/hooks/use-profile';
import { AnalysisLoadingOverlay } from '@/components/loading/analysis-loading-overlay';
import {
  InputWizardStepper,
  type WizardStep,
  type WizardBranch,
} from '@/components/input/input-wizard-stepper';
import { DetectedUrls } from '@/components/input/detected-urls';
import { UrlDiscoveryList } from '@/components/scrape/url-discovery-list';
import { ScrapeProgress } from '@/components/scrape/scrape-progress';
import { RecentScrapeJobs } from '@/components/scrape/recent-scrape-jobs';
import { InputPageQuickNav } from '@/components/input/input-page-quick-nav';
import { getPlatformIconByName } from '@/components/ui/platform-icons';
import { parseInputContent } from '@/lib/utils/parse-input-content';
import {
  estimateImportTime,
  formatTimeEstimate,
  type UrlEstimateInput,
} from '@/lib/utils/estimate-import-time';
import { composeCost, type Recipe } from '@/domain/models/credit-blocks';
import { toast } from 'sonner';

const TEXT_RECIPE: Recipe = [
  { block: 'scrape.html', units: 1 },
  { block: 'ai.analyze.short', units: 1 },
];
// Default 10-minute captionless YouTube long-video estimate.
const YOUTUBE_DEFAULT_RECIPE: Recipe = [
  { block: 'scrape.youtube_meta', units: 1 },
  { block: 'download.audio.long', units: 10 },
  { block: 'transcribe.audio', units: 10 },
  { block: 'ai.analyze.short', units: 1 },
];

const YOUTUBE_URL_PATTERN = /youtube\.com|youtu\.be/i;
const TIKTOK_URL_PATTERN = /tiktok\.com/i;

function detectUrlPlatformForEstimate(url: string): 'youtube' | 'twitter' | 'other' {
  if (YOUTUBE_URL_PATTERN.test(url)) return 'youtube';
  if (TIKTOK_URL_PATTERN.test(url)) return 'other';
  return 'twitter';
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  twitter: 'Twitter/X',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  podcast: 'Podcast',
};

const MAX_URLS = 5;

/**
 * WizardState: a discriminated union covering all three input branches.
 *
 *  - idle:    nothing has been submitted yet (step 1 of any branch)
 *  - text:    free-text → quick-input → draft
 *  - urls:    post URLs → background import
 *  - profile: profile URL → discover → select → scrape
 */
type WizardState =
  | { kind: 'idle' }
  | { kind: 'text'; step: 'processing' | 'done'; draftId: string | null }
  | {
      kind: 'profile';
      step: 'discovering' | 'selecting' | 'processing' | 'completed';
      profileUrl: string;
      discoveryResult: DiscoverProfileResult | null;
      jobId: string | null;
    };

const IDLE: WizardState = { kind: 'idle' };

/**
 * Map a WizardState to a (branch, step-number) pair for the stepper.
 */
function stepperStateFor(state: WizardState): { branch: WizardBranch; step: WizardStep } {
  switch (state.kind) {
    case 'idle':
      return { branch: 'idle', step: 1 };
    case 'text':
      if (state.step === 'processing') return { branch: 'text', step: 2 };
      return { branch: 'text', step: 4 };
    case 'profile':
      if (state.step === 'discovering') return { branch: 'profile', step: 2 };
      if (state.step === 'selecting') return { branch: 'profile', step: 3 };
      if (state.step === 'processing') return { branch: 'profile', step: 4 };
      return { branch: 'profile', step: 5 };
  }
}

export default function InputPage() {
  const t = useTranslations('input');
  const router = useRouter();
  const [content, setContent] = useState('');
  const [wizard, setWizard] = useState<WizardState>(IDLE);

  const quickInput = useQuickInput();
  const { startImport } = useBackgroundImport();
  const discoverProfile = useDiscoverProfile();
  const initiateScrape = useInitiateScrape();
  const { data: profile } = useProfile();

  const isFirstTimeUser = profile?.firstImportFree === true;

  const parsed = useMemo(() => parseInputContent(content), [content]);

  const handleReset = useCallback(() => {
    setContent('');
    setWizard(IDLE);
  }, []);

  // ── text branch ───────────────────────────────────────────────
  const handleTextSubmit = useCallback(async () => {
    if (!content.trim()) return;
    setWizard({ kind: 'text', step: 'processing', draftId: null });
    try {
      const result = await quickInput.mutateAsync(content.trim());
      setContent('');
      if (result.warning === 'no_tickers_identified') {
        toast.warning(t('warnings.noTickersIdentified'), {
          description: t('warnings.noTickersIdentifiedHint'),
        });
      }
      setWizard({ kind: 'text', step: 'done', draftId: result.draft.id });
    } catch (error) {
      toast.error(t('errors.createDraftFailed'), {
        description: error instanceof Error ? error.message : t('errors.tryAgain'),
      });
      setWizard(IDLE);
    }
  }, [content, quickInput, t]);

  // ── post-urls branch ─────────────────────────────────────────
  const handleImportSubmit = useCallback(
    (urls: string[]) => {
      startImport(urls);
      setContent('');
      setWizard(IDLE);
      toast.info(t('wizard.importStarted'));
    },
    [startImport, t]
  );

  // ── profile branch ───────────────────────────────────────────
  const handleDiscoverProfile = useCallback(
    (url: string) => {
      setWizard({
        kind: 'profile',
        step: 'discovering',
        profileUrl: url,
        discoveryResult: null,
        jobId: null,
      });
      discoverProfile.mutate(
        { url },
        {
          onSuccess: (result) => {
            setWizard({
              kind: 'profile',
              step: 'selecting',
              profileUrl: url,
              discoveryResult: result,
              jobId: null,
            });
          },
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : t('errors.tryAgain'));
            setWizard(IDLE);
          },
        }
      );
    },
    [discoverProfile, t]
  );

  const handleConfirmScrapeSelection = useCallback(
    (selectedUrls: string[]) => {
      if (wizard.kind !== 'profile') return;
      const profileUrl = wizard.profileUrl;
      initiateScrape.mutate(
        { url: profileUrl, selectedUrls },
        {
          onSuccess: (data) => {
            setWizard({
              kind: 'profile',
              step: 'processing',
              profileUrl,
              discoveryResult: null,
              jobId: data.id,
            });
          },
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : t('errors.tryAgain'));
          },
        }
      );
    },
    [wizard, initiateScrape, t]
  );

  // ── submit router ────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (parsed.mode === 'profile-url' && parsed.profileUrl) {
      handleDiscoverProfile(parsed.profileUrl);
    } else if (parsed.mode === 'post-urls') {
      handleImportSubmit(parsed.urls);
    } else if (parsed.mode === 'text') {
      handleTextSubmit();
    }
  }, [parsed, handleDiscoverProfile, handleImportSubmit, handleTextSubmit]);

  const isPending = quickInput.isPending || discoverProfile.isPending;

  // Credit/time estimate for the post-urls branch
  const urlEstimate = useMemo(() => {
    if (parsed.mode !== 'post-urls' || parsed.urls.length === 0) return null;
    const urlInputs: UrlEstimateInput[] = parsed.urls.map((url) => ({
      platform: detectUrlPlatformForEstimate(url),
      hasCaptions: false,
      durationSeconds: null,
    }));
    const { batch } = estimateImportTime(urlInputs);
    let credits = 0;
    for (const input of urlInputs) {
      credits += composeCost(input.platform === 'youtube' ? YOUTUBE_DEFAULT_RECIPE : TEXT_RECIPE);
    }
    return { credits, time: formatTimeEstimate(batch) };
  }, [parsed]);

  const tooManyUrls = parsed.mode === 'post-urls' && parsed.urls.length > MAX_URLS;
  const canSubmit =
    parsed.mode !== 'empty' && !isPending && !tooManyUrls && !parsed.hasUnsupportedUrls;

  const submitLabel = (() => {
    if (isPending) return t('actions.analyzing');
    if (parsed.mode === 'profile-url') return t('actions.discoverProfile');
    if (parsed.mode === 'post-urls') return t('actions.importPosts');
    return t('actions.createDraft');
  })();

  const { branch, step } = stepperStateFor(wizard);
  const showInputPane = wizard.kind === 'idle';

  return (
    <div className="min-h-[calc(100vh-8rem)] px-4 pt-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <InputWizardStepper currentStep={step} branch={branch} />

            {showInputPane && (
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

                  {/* Profile URL platform badge */}
                  {parsed.mode === 'profile-url' && parsed.profilePlatform && (
                    <div className="flex items-center gap-2">
                      {getPlatformIconByName(parsed.profilePlatform, 'h-4 w-4')}
                      <Badge variant="secondary" className="text-xs">
                        {PLATFORM_LABELS[parsed.profilePlatform] ?? parsed.profilePlatform}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {t('detection.modeProfile')}
                      </span>
                    </div>
                  )}

                  {/* Detected post URLs (also shown in text mode with mixed URLs) */}
                  {parsed.mode !== 'profile-url' && <DetectedUrls parsed={parsed} />}

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
                          {submitLabel}
                        </>
                      ) : (
                        <>
                          {submitLabel}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* text branch: processing state (overlay handles the UI) */}
            {wizard.kind === 'text' && wizard.step === 'processing' && (
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

            {/* text branch: done */}
            {wizard.kind === 'text' && wizard.step === 'done' && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <h2 className="mt-4 text-xl font-semibold">{t('wizard.completeTitle')}</h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {t('wizard.completeDescription')}
                  </p>
                  <p className="mt-4 text-sm">{t('wizard.summaryDraft')}</p>
                  <div className="mt-6 flex gap-3">
                    {wizard.draftId && (
                      <Button onClick={() => router.push(ROUTES.DRAFT_DETAIL(wizard.draftId!))}>
                        {t('wizard.viewDraft')}
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

            {/* profile branch: discovering */}
            {wizard.kind === 'profile' && wizard.step === 'discovering' && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-muted-foreground text-sm">
                    {t('wizard.processingDescription')}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* profile branch: selecting */}
            {wizard.kind === 'profile' && wizard.step === 'selecting' && wizard.discoveryResult && (
              <UrlDiscoveryList
                kolName={wizard.discoveryResult.kolName}
                kolAvatarUrl={wizard.discoveryResult.kolAvatarUrl}
                platform={wizard.discoveryResult.platform}
                discoveredUrls={wizard.discoveryResult.discoveredUrls}
                onConfirm={handleConfirmScrapeSelection}
                onBack={handleReset}
                isSubmitting={initiateScrape.isPending}
                firstImportFree={isFirstTimeUser}
              />
            )}

            {/* profile branch: processing / completed */}
            {wizard.kind === 'profile' &&
              (wizard.step === 'processing' || wizard.step === 'completed') &&
              wizard.jobId && (
                <ScrapeProgress
                  jobId={wizard.jobId}
                  onReset={handleReset}
                  onComplete={() =>
                    setWizard((prev) =>
                      prev.kind === 'profile' ? { ...prev, step: 'completed' } : prev
                    )
                  }
                />
              )}

            {/* Recent scrape jobs (bottom of main column, only when history exists) */}
            <RecentScrapeJobs />
          </div>

          {/* Right rail: quick nav to dashboard / kols / stocks */}
          <aside className="lg:col-span-1">
            <InputPageQuickNav />
          </aside>
        </div>
      </div>

      <AnalysisLoadingOverlay isVisible={wizard.kind === 'text' && wizard.step === 'processing'} />
    </div>
  );
}
