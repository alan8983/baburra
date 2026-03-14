'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { ProfileScrapeForm } from '@/components/scrape/profile-scrape-form';
import { ScrapeProgress } from '@/components/scrape/scrape-progress';
import { ScrapeFlowChart, type ScrapeStep } from '@/components/scrape/scrape-flow-chart';
import { UrlDiscoveryList } from '@/components/scrape/url-discovery-list';
import { useScrapeJobs, useDiscoverProfile, useInitiateScrape } from '@/hooks/use-scrape';
import type { DiscoverProfileResult } from '@/hooks/use-scrape';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ScrapeState = 'input' | 'discovering' | 'selecting' | 'processing' | 'redirecting';

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
    case 'redirecting':
      return 5;
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

        {state === 'processing' && activeJobId && (
          <ScrapeProgress jobId={activeJobId} onReset={handleReset} />
        )}

        {state === 'redirecting' && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-sm">{t('progress.statusCompleted')}</p>
            </CardContent>
          </Card>
        )}

        {/* Recent jobs list */}
        {jobs && jobs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('jobs.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{job.kolName ?? job.url}</p>
                      <p className="text-muted-foreground truncate text-xs">{job.url}</p>
                    </div>
                    <Badge variant={statusVariantMap[job.status]}>
                      {t(
                        `progress.status${job.status.charAt(0).toUpperCase()}${job.status.slice(1)}`
                      )}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
