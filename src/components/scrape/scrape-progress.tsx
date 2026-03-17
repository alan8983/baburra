'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Loader2, XCircle, CheckCircle2, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';
import { useScrapeJob, useScrapeJobs } from '@/hooks/use-scrape';

interface ScrapeProgressProps {
  jobId: string;
  onReset: () => void;
}

const statusVariantMap = {
  queued: 'outline',
  processing: 'secondary',
  completed: 'default',
  failed: 'destructive',
  permanently_failed: 'destructive',
} as const;

export function ScrapeProgress({ jobId, onReset }: ScrapeProgressProps) {
  const t = useTranslations('scrape');
  const router = useRouter();
  const { data: job, isLoading } = useScrapeJob(jobId);
  const { data: allJobs } = useScrapeJobs();
  const prevStatusRef = useRef<string | undefined>(undefined);
  const toastShownRef = useRef(false);
  const redirectedRef = useRef(false);
  const [etaMinutes, setEtaMinutes] = useState(0);

  // ETA calculation — track start time and update ETA in effects
  const startTimestampRef = useRef(0);
  useEffect(() => {
    if (startTimestampRef.current === 0) {
      startTimestampRef.current = Date.now();
    }
  }, []);

  const processed = job?.processedUrls ?? 0;
  const total = job?.totalUrls ?? 0;

  useEffect(() => {
    if (processed <= 0 || startTimestampRef.current === 0) return;
    const elapsedMs = Date.now() - startTimestampRef.current;
    const avgMsPerUrl = elapsedMs / processed;
    const remaining = total - processed;
    if (remaining > 0) {
      setEtaMinutes(Math.ceil((avgMsPerUrl * remaining) / 60_000));
    } else {
      setEtaMinutes(0);
    }
  }, [processed, total]);

  // Completion: toast + localStorage + auto-redirect
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = job?.status;

    if (!job || toastShownRef.current) return;

    if ((!prevStatus || prevStatus !== 'completed') && job.status === 'completed') {
      toastShownRef.current = true;
      const kolName = job.kolName ?? 'KOL';
      const imported = job.importedCount ?? job.stats?.postsCreated ?? 0;
      toast.success(t('progress.completeToast', { kolName, count: imported }));

      // Store completion in localStorage for notification bell
      try {
        localStorage.setItem(
          `scrape_completed_${jobId}`,
          JSON.stringify({ kolName, imported, kolId: job.kolId, ts: Date.now() })
        );
      } catch {
        // localStorage unavailable
      }

      // Auto-redirect to KOL detail page
      if (job.kolId && !redirectedRef.current) {
        redirectedRef.current = true;
        router.push(ROUTES.KOL_DETAIL(job.kolId));
      }
    }
  }, [job, jobId, t, router]);

  if (isLoading || !job) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const isActive = job.status === 'queued' || job.status === 'processing';
  const imported = job.importedCount ?? job.stats?.postsCreated ?? 0;
  const duplicates = job.duplicateCount ?? job.stats?.duplicates ?? 0;
  const errors = job.errorCount ?? job.stats?.errors ?? 0;
  const progressPercent = total > 0 ? Math.round((processed / total) * 100) : 0;
  const remainingUrls = total - processed;

  // Queue position: count user's own active jobs created before this one
  const queuePosition =
    job.status === 'queued' && allJobs
      ? allJobs.filter(
          (j) =>
            (j.status === 'queued' || j.status === 'processing') &&
            j.createdAt < job.createdAt &&
            j.id !== job.id
        ).length + 1
      : null;

  const statusKey =
    job.status === 'permanently_failed'
      ? 'Failed'
      : `${job.status.charAt(0).toUpperCase()}${job.status.slice(1)}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('progress.title')}</CardTitle>
          <Badge variant={statusVariantMap[job.status]}>{t(`progress.status${statusKey}`)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Queue position */}
        {queuePosition !== null && queuePosition > 1 && (
          <div className="bg-muted flex items-center gap-2 rounded-md p-3">
            <Users className="text-muted-foreground h-4 w-4" />
            <span className="text-muted-foreground text-sm">
              {t('queue.position', { position: queuePosition })}
            </span>
          </div>
        )}

        {/* Progress bar */}
        {isActive && (
          <div className="space-y-2">
            <div className="bg-secondary h-3 w-full overflow-hidden rounded-full">
              {total > 0 ? (
                <div
                  className="bg-primary h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              ) : (
                <div className="bg-primary h-full w-1/3 animate-pulse rounded-full" />
              )}
            </div>
            {total > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  {t('progress.detailedCounts', {
                    processed,
                    total,
                    imported,
                    duplicates,
                    errors,
                  })}
                </p>
                {processed > 0 && remainingUrls > 0 && (
                  <p className="text-muted-foreground flex items-center gap-1 text-sm">
                    <Clock className="h-3 w-3" />
                    {t('progress.eta', { minutes: etaMinutes })}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Completed state */}
        {job.status === 'completed' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm">
                {t('progress.detailedCounts', {
                  processed,
                  total,
                  imported,
                  duplicates,
                  errors,
                })}
              </span>
            </div>
            {job.kolId && (
              <Button variant="outline" onClick={() => router.push(ROUTES.KOL_DETAIL(job.kolId!))}>
                {t('progress.viewKol')}
              </Button>
            )}
            <Button variant="ghost" onClick={onReset}>
              {t('progress.scrapeAnother')}
            </Button>
          </div>
        )}

        {/* Failed state */}
        {(job.status === 'failed' || job.status === 'permanently_failed') && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              <span className="text-sm">
                {t('progress.errorMessage', { error: job.error ?? '' })}
              </span>
            </div>
            <Button variant="outline" onClick={onReset}>
              {t('progress.scrapeAnother')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
