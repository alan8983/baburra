'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, ChevronDown, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';
import { useImportStatusStore, type ImportJob } from '@/stores/import-status.store';
import { useScrapeJob } from '@/hooks/use-scrape';

const AUTO_DISMISS_MS = 10_000;

function JobToast({ job, onDismiss }: { job: ImportJob; onDismiss: () => void }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Once we have a real scrape job id, drive progress from the server. Until
  // then we show an indeterminate "queued" state using the URL count.
  const { data: scrapeJob } = useScrapeJob(job.scrapeJobId ?? null);

  const totalUrls = scrapeJob?.totalUrls ?? job.urls.length;
  const processed = scrapeJob?.processedUrls ?? 0;
  const isComplete =
    job.phase === 'completed' ||
    job.phase === 'failed' ||
    scrapeJob?.status === 'completed' ||
    scrapeJob?.status === 'failed' ||
    scrapeJob?.status === 'permanently_failed';
  const isErrored = job.phase === 'failed' || scrapeJob?.status === 'failed';
  const progress = totalUrls > 0 ? (processed / totalUrls) * 100 : 0;

  useEffect(() => {
    if (!isComplete || isHovered) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [isComplete, isHovered, onDismiss]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="bg-card text-card-foreground flex items-center gap-2 rounded-lg border px-3 py-2 shadow-lg"
      >
        {isErrored ? (
          <XCircle className="h-4 w-4 text-red-500" />
        ) : isComplete ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        )}
        <span className="text-sm font-medium">
          {processed}/{totalUrls}
        </span>
      </button>
    );
  }

  return (
    <div
      className="bg-card text-card-foreground w-80 rounded-lg border shadow-lg"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">
          {isErrored ? 'Import Failed' : isComplete ? 'Import Complete' : 'Importing...'}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCollapsed(true)}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDismiss}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="px-3 pt-2">
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          {totalUrls > 0 ? (
            <div
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          ) : (
            <div className="bg-primary h-full w-1/3 animate-pulse rounded-full" />
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {processed}/{totalUrls} URLs
          {!isComplete && job.estimatedSeconds > 0 && (
            <> &middot; Est. ~{Math.max(1, Math.ceil(job.estimatedSeconds / 60))} min</>
          )}
        </p>
        {job.errorMessage && <p className="mt-1 text-xs text-red-500">{job.errorMessage}</p>}
      </div>

      <div className="flex items-center justify-between border-t px-3 py-2">
        {job.scrapeJobId ? (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => router.push(`${ROUTES.INPUT}?jobId=${job.scrapeJobId}`)}
          >
            View progress &rarr;
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">Queued...</span>
        )}
        {isComplete && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => router.push(ROUTES.POSTS)}
          >
            View posts &rarr;
          </Button>
        )}
      </div>
    </div>
  );
}

export function ImportStatusToast() {
  const jobs = useImportStatusStore((s) => s.jobs);
  const dismissJob = useImportStatusStore((s) => s.dismissJob);

  const activeJobs = Array.from(jobs.values());

  if (activeJobs.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
      {activeJobs.map((job) => (
        <JobToast key={job.id} job={job} onDismiss={() => dismissJob(job.id)} />
      ))}
    </div>
  );
}
