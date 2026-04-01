'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';
import { useImportStatusStore, type ImportJob } from '@/stores/import-status.store';

const AUTO_DISMISS_MS = 10_000;

function UrlStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'processing':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

function truncateUrl(url: string, maxLength = 40): string {
  if (url.length <= maxLength) return url;
  return url.slice(0, maxLength - 3) + '...';
}

function JobToast({ job, onDismiss }: { job: ImportJob; onDismiss: () => void }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const completedCount = job.urls.filter(
    (u) => u.status === 'success' || u.status === 'error'
  ).length;
  const progress = job.urls.length > 0 ? (completedCount / job.urls.length) * 100 : 0;
  const isComplete = !!job.completedAt;

  // Auto-dismiss after completion
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
        {isComplete ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        )}
        <span className="text-sm font-medium">
          {completedCount}/{job.urls.length}
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
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">
          {isComplete ? 'Import Complete' : 'Importing...'}
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

      {/* Progress */}
      <div className="px-3 pt-2">
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {completedCount}/{job.urls.length} URLs
          {!isComplete && job.estimatedSeconds > 0 && (
            <> &middot; Est. ~{Math.max(1, Math.ceil(job.estimatedSeconds / 60))} min</>
          )}
        </p>
      </div>

      {/* URL list */}
      <div className="max-h-40 overflow-y-auto px-3 py-2">
        {job.urls.map((u, i) => (
          <div key={i} className="flex items-center gap-2 py-1 text-xs">
            <UrlStatusIcon status={u.status} />
            <span className="text-muted-foreground truncate">{truncateUrl(u.url)}</span>
            {u.result?.error && u.result.error !== 'no_tickers_identified' && (
              <span className="ml-auto text-red-500">{u.result.error}</span>
            )}
          </div>
        ))}
      </div>

      {/* Footer with View Results */}
      {isComplete && job.result && (
        <div className="border-t px-3 py-2">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => router.push(ROUTES.POSTS)}
          >
            View Results &rarr;
          </Button>
        </div>
      )}
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
