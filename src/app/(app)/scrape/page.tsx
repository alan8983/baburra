'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ProfileScrapeForm } from '@/components/scrape/profile-scrape-form';
import { ScrapeProgress } from '@/components/scrape/scrape-progress';
import { useScrapeJobs } from '@/hooks/use-scrape';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ScrapePage() {
  const t = useTranslations('scrape');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { data: jobs } = useScrapeJobs();

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
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('description')}</p>
        </div>

        {activeJobId ? (
          <ScrapeProgress jobId={activeJobId} onReset={() => setActiveJobId(null)} />
        ) : (
          <ProfileScrapeForm onJobCreated={setActiveJobId} />
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
