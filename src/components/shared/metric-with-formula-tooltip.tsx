'use client';

import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface MetricWithFormulaTooltipProps {
  label: string;
  value: ReactNode;
  /**
   * Tooltip body. Pre-formatted with the actual numbers plugged in by the
   * caller (next-intl handles interpolation). Newlines render as `<br />`.
   */
  formula: ReactNode;
  className?: string;
  /** Override the tooltip side; defaults to `top`. */
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Inline metric row with a tiny ⓘ trigger that opens a Radix tooltip on
 * hover or focus. The tooltip body is the formula with current numbers
 * substituted, so the user can verify the calculation in place rather than
 * navigating to a docs page.
 */
export function MetricWithFormulaTooltip({
  label,
  value,
  formula,
  className,
  side = 'top',
}: MetricWithFormulaTooltipProps) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', className)}>
      <div className="text-muted-foreground flex items-center gap-1 text-xs">
        <span>{label}</span>
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${label} 公式`}
              className="text-muted-foreground hover:text-foreground inline-flex h-3.5 w-3.5 items-center justify-center"
            >
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={side} className="max-w-xs whitespace-pre-line">
            {formula}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}
