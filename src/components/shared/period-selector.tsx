'use client';

import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { WIN_RATE_PERIODS, type WinRatePeriod } from '@/domain/models/user';

interface PeriodSelectorProps {
  value: WinRatePeriod;
  onChange: (value: WinRatePeriod) => void;
  className?: string;
}

/**
 * Segmented control for selecting a win-rate period (5d/30d/90d/365d).
 * Purely presentational — callers manage the state and feed it back.
 */
export function PeriodSelector({ value, onChange, className }: PeriodSelectorProps) {
  const t = useTranslations('common');

  return (
    <Tabs
      value={value}
      onValueChange={(v) => onChange(v as WinRatePeriod)}
      className={cn('inline-flex', className)}
    >
      <TabsList className="h-8">
        {WIN_RATE_PERIODS.map((period) => (
          <TabsTrigger key={period} value={period} className="px-2 text-xs">
            {t(`period.${period}`)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
