'use client';

import { cn } from '@/lib/utils';

interface SigmaBandHistogramProps {
  /**
   * Six-bin σ-band histogram of direction-adjusted excessReturn.
   * Index → bin range:
   *   0: < −2σ        2: −1σ ~ 0      4: +1σ ~ +2σ
   *   1: −2σ ~ −1σ    3: 0 ~ +1σ      5: > +2σ
   */
  bins: readonly [number, number, number, number, number, number];
  /** Suppress axis labels and shrink heights — for mobile or compact layouts. */
  compact?: boolean;
  className?: string;
  /** Optional ARIA label override. Defaults to a localised description. */
  ariaLabel?: string;
}

const BIN_LABELS = ['<-2σ', '-2~-1σ', '-1~0', '0~+1σ', '+1~+2σ', '>+2σ'] as const;

const BIN_COLOURS = [
  // Wrong-side bins (red gradient, deepest at the far-left tail)
  'bg-red-700 dark:bg-red-500',
  'bg-red-500 dark:bg-red-400',
  'bg-red-300 dark:bg-red-300',
  // Right-side bins (green gradient, deepest at the far-right tail)
  'bg-emerald-300 dark:bg-emerald-300',
  'bg-emerald-500 dark:bg-emerald-400',
  'bg-emerald-700 dark:bg-emerald-500',
] as const;

/**
 * Vertical bar chart of σ-band counts. Heights are normalised to the tallest
 * bin so the chart never grows beyond its container; empty bins render as a
 * thin baseline rather than disappearing, so the user can see the full
 * distribution shape (including missing tails).
 */
export function SigmaBandHistogram({
  bins,
  compact = false,
  className,
  ariaLabel,
}: SigmaBandHistogramProps) {
  const maxCount = Math.max(...bins, 1);
  const total = bins.reduce((a, b) => a + b, 0);
  const barAreaHeight = compact ? 48 : 88;
  const baselineHeight = 2; // px — visible even for empty bins
  const labelHeight = compact ? 0 : 18;
  const totalHeight = barAreaHeight + labelHeight + 4;

  return (
    <div
      role="img"
      aria-label={
        ariaLabel ?? `σ-band histogram, total ${total} samples, distribution: ${bins.join(', ')}`
      }
      className={cn('inline-flex flex-col gap-1', className)}
      style={{ height: totalHeight }}
    >
      <div className="flex h-full items-end gap-[2px]" style={{ height: barAreaHeight }}>
        {bins.map((count, i) => {
          const ratio = count / maxCount;
          const px = Math.max(baselineHeight, Math.round(ratio * barAreaHeight));
          return (
            <div
              key={i}
              className="relative flex w-6 flex-col items-center justify-end"
              style={{ height: barAreaHeight }}
              title={`${BIN_LABELS[i]}: ${count}`}
            >
              <div
                className={cn(
                  'w-full rounded-t-sm transition-[height] duration-300',
                  count === 0 ? 'bg-muted' : BIN_COLOURS[i]
                )}
                style={{ height: px }}
              />
            </div>
          );
        })}
      </div>
      {!compact && (
        <div className="flex gap-[2px]">
          {BIN_LABELS.map((label, i) => (
            <div
              key={i}
              className="text-muted-foreground w-6 text-center font-mono text-[9px] leading-tight"
            >
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
