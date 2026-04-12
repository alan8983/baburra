'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  XCircle,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  CircleDashed,
  FileAudio,
  Mic,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';
import { useScrapeJob, useScrapeJobs, useScrapeJobItems } from '@/hooks/use-scrape';
import type { ScrapeJobItem, ScrapeJobItemStage } from '@/domain/models';

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

// Stage → static progress fill for non-downloading stages.
const STAGE_PROGRESS: Record<ScrapeJobItemStage, number> = {
  queued: 0,
  discovering: 10,
  downloading: 35, // overridden by byte-based fill when available
  transcribing: 70,
  analyzing: 90,
  done: 100,
  failed: 100,
};

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return '0 MB';
  const mb = bytes / 1_000_000;
  if (mb < 1) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${mb.toFixed(1)} MB`;
}

function truncateUrl(url: string, maxLength = 52): string {
  if (url.length <= maxLength) return url;
  return url.slice(0, maxLength - 3) + '...';
}

function StageIcon({ stage }: { stage: ScrapeJobItemStage }) {
  switch (stage) {
    case 'queued':
      return <CircleDashed className="h-4 w-4 text-gray-400" />;
    case 'discovering':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'downloading':
      return <FileAudio className="h-4 w-4 text-blue-500" />;
    case 'transcribing':
      return <Mic className="h-4 w-4 text-indigo-500" />;
    case 'analyzing':
      return <Sparkles className="h-4 w-4 text-purple-500" />;
    case 'done':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
  }
}

function computeItemProgress(item: ScrapeJobItem): number {
  if (item.stage === 'downloading' && item.bytesTotal && item.bytesTotal > 0) {
    const pct = Math.round(((item.bytesDownloaded ?? 0) / item.bytesTotal) * 100);
    // Clamp to the downloading slot so the bar never overshoots the
    // "transcribing" stage on unexpected bytesDownloaded > bytesTotal.
    return Math.max(5, Math.min(65, pct));
  }
  return STAGE_PROGRESS[item.stage];
}

function ItemRow({ item }: { item: ScrapeJobItem }) {
  const t = useTranslations('scrape');
  const progress = computeItemProgress(item);
  const isIndeterminate = item.stage === 'downloading' && (item.bytesTotal ?? 0) <= 0;
  const label = (() => {
    const key = `progress.stage${item.stage.charAt(0).toUpperCase()}${item.stage.slice(1)}`;
    return t(key);
  })();

  return (
    <div className="space-y-1 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <StageIcon stage={item.stage} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title ?? truncateUrl(item.url)}</p>
          {item.title && (
            <p className="text-muted-foreground truncate text-xs">{truncateUrl(item.url)}</p>
          )}
        </div>
        <Badge variant="outline" className="shrink-0 text-xs">
          {label}
        </Badge>
      </div>
      <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
        {isIndeterminate ? (
          <div className="bg-primary h-full w-1/3 animate-pulse rounded-full" />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              item.stage === 'failed' ? 'bg-red-500' : 'bg-primary'
            }`}
            style={{ width: `${progress}%` }}
          />
        )}
      </div>
      {item.stage === 'downloading' && item.bytesTotal && item.bytesTotal > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t('progress.downloadBytes', {
            downloaded: formatBytes(item.bytesDownloaded),
            total: formatBytes(item.bytesTotal),
          })}
        </p>
      ) : item.stage === 'downloading' ? (
        <p className="text-muted-foreground text-xs">{t('progress.downloadBytesUnknown')}</p>
      ) : null}
      {item.stage === 'failed' && item.errorMessage && (
        <p className="text-xs text-red-500">{item.errorMessage}</p>
      )}
    </div>
  );
}

export function ScrapeProgress({ jobId, onReset, onComplete }: ScrapeProgressProps) {
  const t = useTranslations('scrape');
  const router = useRouter();
  const { data: job, isLoading } = useScrapeJob(jobId);
  const { data: items } = useScrapeJobItems(jobId);
  const { data: allJobs } = useScrapeJobs();
  const prevStatusRef = useRef<string | undefined>(undefined);
  const toastShownRef = useRef(false);
  const [etaMinutes, setEtaMinutes] = useState(0);

  // Start time for ETA calculations
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
      const imported = job.importedCount ?? 0;
      toast.success(t('progress.completeToast', { kolName, count: imported }));

      try {
        localStorage.setItem(
          `scrape_completed_${jobId}`,
          JSON.stringify({ kolName, imported, kolId: job.kolId, ts: Date.now() })
        );
      } catch {
        // localStorage unavailable
      }

      onComplete?.();
    }
  }, [job, jobId, t, onComplete]);

  // Sort items by ordinal so the checklist matches the original queue order.
  const sortedItems = useMemo(() => {
    if (!items) return null;
    return [...items].sort((a, b) => a.ordinal - b.ordinal);
  }, [items]);

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
  const imported = job.importedCount ?? 0;
  const duplicates = job.duplicateCount ?? 0;
  const errors = job.errorCount ?? 0;
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

  // Completion summary card (kept from the legacy component)
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

          {allErrored && (
            <div className="bg-muted flex items-center gap-2 rounded-md p-3">
              <AlertTriangle className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-muted-foreground text-sm">
                {t('progress.noCreditsConsumed')}
              </span>
            </div>
          )}

          {(job.status === 'failed' || job.status === 'permanently_failed') && job.errorMessage && (
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="h-4 w-4 shrink-0" />
              <span className="text-sm">
                {t('progress.errorMessage', { error: job.errorMessage })}
              </span>
            </div>
          )}

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

  // Active job — per-URL checklist.
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('progress.title')}</CardTitle>
          <Badge variant={statusVariantMap[job.status]}>{t(`progress.status${statusKey}`)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {queuePosition !== null && queuePosition > 1 && (
          <div className="bg-muted flex items-center gap-2 rounded-md p-3">
            <Users className="text-muted-foreground h-4 w-4" />
            <span className="text-muted-foreground text-sm">
              {t('queue.position', { position: queuePosition })}
            </span>
          </div>
        )}

        {/* Aggregate job-level progress */}
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

        {/* Per-URL checklist. Legacy jobs (no items seeded) skip this block
            and fall back to the aggregate bar above — keeping the component
            usable for historical scrape jobs. */}
        {sortedItems && sortedItems.length > 0 && (
          <div className="max-h-[420px] space-y-2 overflow-y-auto">
            {sortedItems.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </div>
        )}

        {isActive && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            {t('progress.cancel')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
