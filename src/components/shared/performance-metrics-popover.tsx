'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getSqrQualitativeLabel, type WinRateBucket } from '@/domain/calculators';

interface PerformanceMetricsPopoverProps {
  bucket: WinRateBucket | null;
  className?: string;
}

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatSigma(value: number | null): string {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}σ`;
}

function formatSqr(value: number | null): string {
  if (value === null) return '—';
  return value.toFixed(2);
}

/**
 * Click-to-open popover surfacing the full PeriodMetrics detail: precision,
 * SQR (with qualitative label), σ-normalized excess win/lose, and the
 * resolved threshold. Triggered by an `ⓘ` icon next to the primary metric.
 */
export function PerformanceMetricsPopover({ bucket, className }: PerformanceMetricsPopoverProps) {
  const t = useTranslations('common.metrics');
  const sqrKey = getSqrQualitativeLabel(bucket?.sqr ?? null);

  const sqrBadgeClass =
    sqrKey === 'excellent'
      ? 'text-emerald-600 dark:text-emerald-400'
      : sqrKey === 'decent'
        ? 'text-blue-600 dark:text-blue-400'
        : sqrKey === 'unstable'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-muted-foreground';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('detailsTrigger')}
          className={cn('text-muted-foreground hover:text-foreground h-5 w-5 p-0', className)}
        >
          <Info className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-64 text-xs">
        <div className="space-y-2">
          <p className="text-sm font-semibold">{t('title')}</p>
          <dl className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">{t('precision')}</dt>
              <dd className="font-mono">{formatPercent(bucket?.precision ?? null)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">{t('sqr')}</dt>
              <dd className="flex items-baseline gap-1 font-mono">
                <span>{formatSqr(bucket?.sqr ?? null)}</span>
                {bucket?.sqr != null && (
                  <span className={cn('text-[10px]', sqrBadgeClass)}>
                    · {t(`sqrLabel.${sqrKey}`)}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">{t('avgExcessWin')}</dt>
              <dd className="font-mono">{formatSigma(bucket?.avgExcessWin ?? null)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">{t('avgExcessLose')}</dt>
              <dd className="font-mono">{formatSigma(bucket?.avgExcessLose ?? null)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">{t('threshold')}</dt>
              <dd className="font-mono">
                {bucket?.threshold
                  ? `±${(bucket.threshold.value * 100).toFixed(1)}%${
                      bucket.threshold.source === 'index-fallback' ? ' (idx)' : ''
                    }`
                  : '—'}
              </dd>
            </div>
          </dl>
          <p className="text-muted-foreground pt-1 text-[10px] leading-snug">{t('sqrExplainer')}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
