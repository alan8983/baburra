'use client';

import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import type { PriceChangeStatus } from '@/domain/models/post';

interface PriceChangeBadgeProps {
  value: number | null;
  status?: PriceChangeStatus;
  label: string;
}

export function PriceChangeBadge({ value, status, label }: PriceChangeBadgeProps) {
  const t = useTranslations('common');
  const { colors } = useColorPalette();

  const effectiveStatus = status ?? (value != null ? 'value' : 'no_data');

  if (effectiveStatus === 'pending') {
    return (
      <span className="text-muted-foreground text-xs" title={t('priceChange.pending')}>
        {label} <Clock className="inline h-3 w-3" />
      </span>
    );
  }

  if (effectiveStatus === 'no_data') {
    return (
      <span className="text-muted-foreground/50 text-xs" title={t('priceChange.noData')}>
        {label} N/A
      </span>
    );
  }

  const colorClass = value! >= 0 ? colors.bullish.text : colors.bearish.text;
  return (
    <span className={`text-sm ${colorClass}`}>
      {label} {value! >= 0 ? '+' : ''}
      {value!.toFixed(1)}%
    </span>
  );
}
