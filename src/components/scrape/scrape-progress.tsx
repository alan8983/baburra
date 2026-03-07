'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ROUTES } from '@/lib/constants';
import { useScrapeJob } from '@/hooks/use-scrape';

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

const EARLY_VALUE_THRESHOLD = 5;

export function ScrapeProgress({ jobId, onReset }: ScrapeProgressProps) {
  const t = useTranslations('scrape');
  const { data: job, isLoading } = useScrapeJob(jobId);
  const prevStatusRef = useRef<string | undefined>(undefined);
  const [startTimestamp] = useState(Date.now());
  const toastShownRef = useRef(false as boolean);

  // Completion toast notification
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = job?.status;

    if (!job || toastShownRef.current) return;

    if (prevStatus && prevStatus !== 'completed' && job.status === 'completed') {
      toastShownRef.current = true;
      const kolName = job.kolName ?? 'KOL';
      const imported = job.importedCount ?? job.stats?.postsCreated ?? 0;
      toast.success(t('progress.completeToast', { kolName, count: imported }));

      // Store completion in localStorage for cross-page notification
      try {
        localStorage.setItem(
          `scrape_completed_${jobId}`,
          JSON.stringify({ kolName, imported, kolId: job.kolId, ts: Date.now() })
        );
      } catch {
        // localStorage unavailable
      }
    }
  }, [job, jobId, t]);

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
  const processed = job.processedUrls ?? 0;
  const total = job.totalUrls ?? 0;
  const imported = job.importedCount ?? job.stats?.postsCreated ?? 0;
  const duplicates = job.duplicateCount ?? job.stats?.duplicates ?? 0;
  const errors = job.errorCount ?? job.stats?.errors ?? 0;
  const progressPercent = total > 0 ? Math.round((processed / total) * 100) : 0;

  // Calculate ETA
  const elapsedMs = Date.now() - startTimestamp;
  const avgMsPerUrl = processed > 0 ? elapsedMs / processed : 0;
  const remainingUrls = total - processed;
  const etaMs = avgMsPerUrl * remainingUrls;
  const etaMinutes = Math.ceil(etaMs / 60_000);

  // Early value: show nudge after first batch processed
  const showEarlyNudge = isActive && processed >= EARLY_VALUE_THRESHOLD && !!job.kolId;

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

        {/* Early value nudge */}
        {showEarlyNudge && (
          <Alert>
            <AlertDescription className="flex items-center justify-between">
              <span>{t('progress.earlyNudge')}</span>
              <Button asChild size="sm" variant="outline">
                <Link href={ROUTES.KOL_DETAIL(job.kolId!)}>
                  {t('progress.viewKolEarly', { kolName: job.kolName ?? 'KOL' })}
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Completed state */}
        {job.status === 'completed' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">{t('progress.statusCompleted')}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {total > 0 && (
                <Badge variant="secondary">
                  {t('progress.stats.videosFound', { count: total })}
                </Badge>
              )}
              <Badge>{t('progress.stats.postsCreated', { count: imported })}</Badge>
              {duplicates > 0 && (
                <Badge variant="outline">
                  {t('progress.stats.duplicates', { count: duplicates })}
                </Badge>
              )}
              {errors > 0 && (
                <Badge variant="destructive">{t('progress.stats.errors', { count: errors })}</Badge>
              )}
            </div>

            <div className="flex gap-2">
              {job.kolId && (
                <Button asChild>
                  <Link href={ROUTES.KOL_DETAIL(job.kolId)}>{t('progress.viewKol')}</Link>
                </Button>
              )}
              <Button variant="outline" onClick={onReset}>
                {t('progress.scrapeAnother')}
              </Button>
            </div>
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
