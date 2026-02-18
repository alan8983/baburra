'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Sentiment } from '@/domain/models';

export interface SentimentOption {
  value: Sentiment;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  hoverColor: string;
  icon: React.ReactNode;
}

// Helper function to get sentiment options with translations
function useSentimentOptions(): SentimentOption[] {
  const t = useTranslations('common');

  return [
    {
      value: -2,
      label: t('sentiment.stronglyBearish'),
      shortLabel: t('sentiment.stronglyBearishShort'),
      color: 'text-red-700',
      bgColor: 'bg-red-600 text-white border-red-600',
      hoverColor: 'hover:bg-red-50 hover:text-red-700 hover:border-red-300',
      icon: <TrendingDown className="h-4 w-4" />,
    },
    {
      value: -1,
      label: t('sentiment.bearish'),
      shortLabel: t('sentiment.bearishShort'),
      color: 'text-red-600',
      bgColor: 'bg-red-100 text-red-700 border-red-200',
      hoverColor: 'hover:bg-red-50 hover:text-red-600 hover:border-red-200',
      icon: <TrendingDown className="h-4 w-4" />,
    },
    {
      value: 0,
      label: t('sentiment.neutral'),
      shortLabel: t('sentiment.neutralShort'),
      color: 'text-gray-600',
      bgColor: 'bg-gray-100 text-gray-700 border-gray-200',
      hoverColor: 'hover:bg-gray-50 hover:text-gray-600 hover:border-gray-200',
      icon: <Minus className="h-4 w-4" />,
    },
    {
      value: 1,
      label: t('sentiment.bullish'),
      shortLabel: t('sentiment.bullishShort'),
      color: 'text-green-600',
      bgColor: 'bg-green-100 text-green-700 border-green-200',
      hoverColor: 'hover:bg-green-50 hover:text-green-600 hover:border-green-200',
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      value: 2,
      label: t('sentiment.stronglyBullish'),
      shortLabel: t('sentiment.stronglyBullishShort'),
      color: 'text-green-700',
      bgColor: 'bg-green-600 text-white border-green-600',
      hoverColor: 'hover:bg-green-50 hover:text-green-700 hover:border-green-300',
      icon: <TrendingUp className="h-4 w-4" />,
    },
  ];
}

export interface SentimentSelectorProps {
  /** 選中的情緒值 */
  value: Sentiment | null;
  /** 選擇變更回調 */
  onChange: (sentiment: Sentiment) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自訂 className */
  className?: string;
  /** 是否顯示圖示 */
  showIcon?: boolean;
  /** 是否使用簡短標籤 */
  shortLabel?: boolean;
}

export function SentimentSelector({
  value,
  onChange,
  disabled = false,
  className,
  showIcon = true,
  shortLabel = false,
}: SentimentSelectorProps) {
  const sentimentOptions = useSentimentOptions();

  return (
    <div className={cn('space-y-3', className)}>
      {/* 情緒選擇按鈕 */}
      <div className="flex flex-wrap gap-2">
        {sentimentOptions.map((option) => {
          const isSelected = value === option.value;

          return (
            <Button
              key={option.value}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn('transition-all', isSelected ? option.bgColor : option.hoverColor)}
            >
              {showIcon && option.icon}
              <span className={showIcon ? 'ml-1' : ''}>
                {shortLabel ? option.shortLabel : option.label}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// Note: These helper functions are deprecated. Use useSentimentOptions hook in components instead.
// They are kept for backward compatibility but will not support i18n.
// For i18n support, use the hook in your component and get the option directly.
