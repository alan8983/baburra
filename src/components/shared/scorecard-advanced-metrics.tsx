'use client';

import { useTranslations } from 'next-intl';
import { getSqrQualitativeLabel, type WinRateBucket } from '@/domain/calculators';
import { MetricWithFormulaTooltip } from './metric-with-formula-tooltip';
import { cn } from '@/lib/utils';

interface ScorecardAdvancedMetricsProps {
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

function formatThreshold(bucket: WinRateBucket): string {
  if (!bucket.threshold) return '—';
  const pct = (bucket.threshold.value * 100).toFixed(1);
  const suffix = bucket.threshold.source === 'index-fallback' ? ' (idx)' : '';
  return `±${pct}%${suffix}`;
}

/**
 * Inline "Advanced Analytics" section. Renders the σ-derived metrics in two
 * groups, each row with an ⓘ tooltip exposing the formula populated from
 * the bucket's actual numbers.
 */
export function ScorecardAdvancedMetrics({ bucket, className }: ScorecardAdvancedMetricsProps) {
  const t = useTranslations('common.metrics');
  if (!bucket) return null;

  const sqrKey = getSqrQualitativeLabel(bucket.sqr);
  const sqrBadgeClass =
    sqrKey === 'excellent'
      ? 'text-emerald-600 dark:text-emerald-400'
      : sqrKey === 'decent'
        ? 'text-blue-600 dark:text-blue-400'
        : sqrKey === 'unstable'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-muted-foreground';

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <h3 className="text-sm font-semibold">{t('advancedHeading')}</h3>

      <section className="space-y-1.5">
        <h4 className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          {t('strongSignalGroup')}
        </h4>
        <MetricWithFormulaTooltip
          label={t('precision')}
          value={formatPercent(bucket.precision)}
          formula={t('formulaTooltip.precision', {
            wins: bucket.winCount,
            loses: bucket.loseCount,
            value: formatPercent(bucket.precision),
          })}
        />
        <MetricWithFormulaTooltip
          label={t('hitRate')}
          value={formatPercent(bucket.hitRate)}
          formula={t('formulaTooltip.hitRate', {
            wins: bucket.winCount,
            total: bucket.winCount + bucket.loseCount + bucket.noiseCount,
            value: formatPercent(bucket.hitRate),
          })}
        />
      </section>

      <section className="space-y-1.5">
        <h4 className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          {t('returnQualityGroup')}
        </h4>
        <MetricWithFormulaTooltip
          label={t('sqr')}
          value={
            <span className="flex items-baseline gap-1">
              <span>{formatSqr(bucket.sqr)}</span>
              {bucket.sqr !== null && (
                <span className={cn('text-[10px]', sqrBadgeClass)}>
                  · {t(`sqrLabel.${sqrKey}`)}
                </span>
              )}
            </span>
          }
          formula={t('formulaTooltip.sqr', { value: formatSqr(bucket.sqr) })}
        />
        <MetricWithFormulaTooltip
          label={t('avgExcessWin')}
          value={formatSigma(bucket.avgExcessWin)}
          formula={t('formulaTooltip.avgExcessWin', {
            value: bucket.avgExcessWin !== null ? bucket.avgExcessWin.toFixed(2) : '—',
          })}
        />
        <MetricWithFormulaTooltip
          label={t('avgExcessLose')}
          value={formatSigma(bucket.avgExcessLose)}
          formula={t('formulaTooltip.avgExcessLose', {
            value: bucket.avgExcessLose !== null ? bucket.avgExcessLose.toFixed(2) : '—',
          })}
        />
        <MetricWithFormulaTooltip
          label={t('threshold')}
          value={formatThreshold(bucket)}
          formula={t('formulaTooltip.threshold', {
            value:
              bucket.threshold !== null ? `${(bucket.threshold.value * 100).toFixed(1)}%` : '—',
          })}
        />
      </section>
    </div>
  );
}
