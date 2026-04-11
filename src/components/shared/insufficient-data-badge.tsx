'use client';

import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { MIN_RESOLVED_POSTS_PER_PERIOD } from '@/domain/calculators';

interface InsufficientDataBadgeProps {
  className?: string;
}

/**
 * Small inline badge shown when a `WinRateBucket` has `sufficientData === false`.
 * Explains the minimum-resolved-posts floor via tooltip.
 */
export function InsufficientDataBadge({ className }: InsufficientDataBadgeProps) {
  const t = useTranslations('common.metrics');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'text-muted-foreground inline-flex items-center gap-1 text-[10px]',
              className
            )}
          >
            <AlertCircle className="h-3 w-3" />
            {t('insufficientData')}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px] text-xs">
          {t('insufficientDataTooltip', { min: MIN_RESOLVED_POSTS_PER_PERIOD })}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
