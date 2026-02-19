'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CandleInterval, TimeRange } from './candle-aggregator';

interface ChartToolbarProps {
  interval: CandleInterval;
  onIntervalChange: (interval: CandleInterval) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

export function ChartToolbar({
  interval,
  onIntervalChange,
  timeRange,
  onTimeRangeChange,
}: ChartToolbarProps) {
  const t = useTranslations('common');

  const INTERVALS: { value: CandleInterval; label: string }[] = [
    { value: 'day', label: t('chart.intervals.day') },
    { value: 'week', label: t('chart.intervals.week') },
    { value: 'month', label: t('chart.intervals.month') },
    { value: 'quarter', label: t('chart.intervals.quarter') },
    { value: 'year', label: t('chart.intervals.year') },
  ];

  const TIME_RANGES: { value: TimeRange; label: string }[] = [
    { value: '1M', label: t('chart.timeRanges.1M') },
    { value: '1Q', label: t('chart.timeRanges.1Q') },
    { value: 'YTD', label: t('chart.timeRanges.YTD') },
    { value: '1Y', label: t('chart.timeRanges.1Y') },
    { value: '5Y', label: t('chart.timeRanges.5Y') },
  ];

  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex gap-1">
        {INTERVALS.map((item) => (
          <Button
            key={item.value}
            variant={interval === item.value ? 'default' : 'outline'}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => onIntervalChange(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div className="ml-auto">
        <Select value={timeRange} onValueChange={(v) => onTimeRangeChange(v as TimeRange)}>
          <SelectTrigger size="sm" className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
