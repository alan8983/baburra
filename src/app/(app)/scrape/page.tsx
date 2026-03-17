'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ProfileScrapeForm } from '@/components/scrape/profile-scrape-form';
import { ScrapeProgress } from '@/components/scrape/scrape-progress';
import { ScrapeFlowChart, type ScrapeStep } from '@/components/scrape/scrape-flow-chart';
import { UrlDiscoveryList } from '@/components/scrape/url-discovery-list';
import { useScrapeJobs, useDiscoverProfile, useInitiateScrape } from '@/hooks/use-scrape';
import type { DiscoverProfileResult } from '@/hooks/use-scrape';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants';

type ScrapeState = 'input' | 'discovering' | 'selecting' | 'processing' | 'completed';

function stateToStep(state: ScrapeState): ScrapeStep {
  switch (state) {
    case 'input':
      return 1;
    case 'discovering':
      return 2;
    case 'selecting':
      return 2;
    case 'processing':
      return 3;
    case 'completed':
      return 4;
  }
}

export default function ScrapePage() {
  const t = useTranslations('scrape');
  const { data: jobs } = useScrapeJobs();
  const discoverProfile = useDiscoverProfile();
  const initiateScrape = useInitiateScrape();

  const [state, setState] = useState<ScrapeState>('input');
  const [profileUrl, setProfileUrl] = useState('');
  const [discoverResult, setDiscoverResult] = useState<DiscoverProfileResult | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const currentStep = stateToStep(state);

  // Step 1 → Step 2: User submits URL, discover content
  const handleUrlSubmit = (url: string) => {
    setProfileUrl(url);
    setState('discovering');
    setError(false);

    discoverProfile.mutate(
      { url },
      {
        onSuccess: (result) => {
          setDiscoverResult(result);
          setState('selecting');
        },
        onError: () => {
          setError(true);
          setState('input');
        },
      }
    );
  };

  // Step 2 → Step 3: User confirms selected URLs
  const handleConfirmSelection = (selectedUrls: string[]) => {
    initiateScrape.mutate(
      { url: profileUrl, selectedUrls },
      {
        onSuccess: (data) => {
          setActiveJobId(data.id);
          setState('processing');
        },
        onError: () => {
          setError(true);
        },
      }
    );
  };

  // Reset to Step 1
  const handleReset = () => {
    setState('input');
    setProfileUrl('');
    setDiscoverResult(null);
    setActiveJobId(null);
    setError(false);
  };

  const statusVariantMap: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
    queued: 'outline',
    processing: 'secondary',
    completed: 'default',
    failed: 'destructive',
    permanently_failed: 'destructive',
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('description')}</p>
        </div>

        {/* Flow Chart */}
        <ScrapeFlowChart currentStep={currentStep} error={error} />

        {/* Content area — conditional on state */}
        {state === 'input' && <ProfileScrapeForm onJobCreated={handleUrlSubmit} />}

        {state === 'discovering' && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-sm">{t('discover.loading')}</p>
            </CardContent>
          </Card>
        )}

        {state === 'selecting' && discoverResult && (
          <UrlDiscoveryList
            kolName={discoverResult.kolName}
            kolAvatarUrl={discoverResult.kolAvatarUrl}
            platform={discoverResult.platform}
            discoveredUrls={discoverResult.discoveredUrls}
            onConfirm={handleConfirmSelection}
            onBack={handleReset}
            isSubmitting={initiateScrape.isPending}
          />
        )}

        {(state === 'processing' || state === 'completed') && activeJobId && (
          <ScrapeProgress
            jobId={activeJobId}
            onReset={handleReset}
            onComplete={() => setState('completed')}
          />
        )}

        {/* Recent jobs list */}
        {jobs && jobs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('jobs.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {jobs.map((job) => {
                  const statusKey =
                    job.status === 'permanently_failed'
                      ? 'Failed'
                      : `${job.status.charAt(0).toUpperCase()}${job.status.slice(1)}`;
                  const isClickable = job.kolId && job.status === 'completed';
                  const dateStr = job.completedAt
                    ? new Date(job.completedAt).toLocaleDateString()
                    : new Date(job.createdAt).toLocaleDateString();

                  const content = (
                    <div className="hover:bg-muted/50 flex items-center justify-between rounded-md border p-3 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {job.kolName ?? 'Unknown KOL'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {dateStr}
                          {' \u2022 '}
                          {t('jobs.importedCount', { count: job.importedCount ?? 0 })}
                          {(job.errorCount ?? 0) > 0 && (
                            <>
                              {' \u2022 '}
                              <span className="text-red-500">
                                {t('jobs.errorCount', { count: job.errorCount ?? 0 })}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <Badge variant={statusVariantMap[job.status]}>
                        {t(`progress.status${statusKey}`)}
                      </Badge>
                    </div>
                  );

                  return isClickable ? (
                    <Link key={job.id} href={ROUTES.KOL_DETAIL(job.kolId!)}>
                      {content}
                    </Link>
                  ) : (
                    <div key={job.id}>{content}</div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
