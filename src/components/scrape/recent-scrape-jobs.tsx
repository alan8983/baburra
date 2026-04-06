'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants';
import { useScrapeJobs } from '@/hooks/use-scrape';

const statusVariantMap: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  queued: 'outline',
  processing: 'secondary',
  completed: 'default',
  failed: 'destructive',
  permanently_failed: 'destructive',
};

/**
 * Recent scrape jobs list. Renders nothing if there are no jobs. Used at the
 * bottom of the unified input page so the user can see active and past
 * profile-scrape jobs in one place.
 */
export function RecentScrapeJobs() {
  const t = useTranslations('scrape');
  const { data: jobs } = useScrapeJobs();

  if (!jobs || jobs.length === 0) return null;

  return (
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
                  <p className="truncate text-sm font-medium">{job.kolName ?? 'Unknown KOL'}</p>
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
  );
}
