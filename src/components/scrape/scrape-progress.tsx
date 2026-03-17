'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Loader2, XCircle, Clock, Users, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';
import { useScrapeJob, useScrapeJobs } from '@/hooks/use-scrape';

interface ScrapeProgressProps {
  jobId: string;
  onReset: () => void;
  onComplete?: () => void;
}

const statusVariantMap = {
  queued: 'outline',
  processing: 'secondary',
  completed: 'default',
  failed: 'destructive',
  permanently_failed: 'destructive',
} as const;

export function ScrapeProgress({ jobId, onReset, onComplete }: ScrapeProgressProps) {
  const t = useTranslations('scrape');
  const router = useRouter();
  const { data: job, isLoading } = useScrapeJob(jobId);
  const { data: allJobs } = useScrapeJobs();
  const prevStatusRef = useRef<string | undefined>(undefined);
  const toastShownRef = useRef(false);
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

  // Completion: toast + localStorage + notify parent (no auto-redirect)
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = job?.status;

    if (!job || toastShownRef.current) return;

    const isFinished = job.status === 'completed' || job.status === 'failed';
    const wasNotFinished = !prevStatus || (prevStatus !== 'completed' && prevStatus !== 'failed');

    if (wasNotFinished && isFinished) {
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

      // Notify parent to transition flow chart to step 4
      onComplete?.();
    }
  }, [job, jobId, t, onComplete]);

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
  const isFinished =
    job.status === 'completed' || job.status === 'failed' || job.status === 'permanently_failed';
  const imported = job.importedCount ?? job.stats?.postsCreated ?? 0;
  const duplicates = job.duplicateCount ?? job.stats?.duplicates ?? 0;
  const errors = job.errorCount ?? job.stats?.errors ?? 0;
  const filtered = job.filteredCount ?? 0;
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

  // Completion summary card (tasks 2.1-2.3)
  if (isFinished) {
    const allErrored = imported === 0 && errors > 0;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {allErrored ? (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              {t('progress.summaryTitle')}
            </CardTitle>
            <Badge variant={statusVariantMap[job.status]}>{t(`progress.status${statusKey}`)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary counts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted rounded-md p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{imported}</p>
              <p className="text-muted-foreground text-xs">
                {t('progress.summaryImported', { count: imported })}
              </p>
            </div>
            <div className="bg-muted rounded-md p-3 text-center">
              <p className="text-2xl font-bold text-red-500">{errors}</p>
              <p className="text-muted-foreground text-xs">
                {t('progress.summaryErrors', { count: errors })}
              </p>
            </div>
            {filtered > 0 && (
              <div className="bg-muted rounded-md p-3 text-center">
                <p className="text-2xl font-bold text-yellow-500">{filtered}</p>
                <p className="text-muted-foreground text-xs">
                  {t('progress.summaryFiltered', { count: filtered })}
                </p>
              </div>
            )}
            {duplicates > 0 && (
              <div className="bg-muted rounded-md p-3 text-center">
                <p className="text-2xl font-bold text-gray-500">{duplicates}</p>
                <p className="text-muted-foreground text-xs">
                  {t('progress.summaryDuplicates', { count: duplicates })}
                </p>
              </div>
            )}
          </div>

          {/* No credits consumed message (task 2.3) */}
          {allErrored && (
            <div className="bg-muted flex items-center gap-2 rounded-md p-3">
              <AlertTriangle className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-muted-foreground text-sm">
                {t('progress.noCreditsConsumed')}
              </span>
            </div>
          )}

          {/* Failed job error message */}
          {(job.status === 'failed' || job.status === 'permanently_failed') && job.error && (
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{t('progress.errorMessage', { error: job.error })}</span>
            </div>
          )}

          {/* Action buttons (task 2.2) */}
          <div className="flex gap-3">
            {job.kolId && (
              <Button onClick={() => router.push(ROUTES.KOL_DETAIL(job.kolId!))}>
                {t('progress.viewKol')}
              </Button>
            )}
            <Button variant="outline" onClick={onReset}>
              {t('progress.startOver')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

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

        {/* Cancel during active processing (task 2.5) */}
        {isActive && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            {t('progress.cancel')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
