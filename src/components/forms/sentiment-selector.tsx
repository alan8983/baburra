'use client';

import * as React from 'react';
import { TrendingDown, TrendingUp, Minus, Sparkles } from 'lucide-react';
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

export const SENTIMENT_OPTIONS: SentimentOption[] = [
  {
    value: -2,
    label: '強烈看空',
    shortLabel: '強空',
    color: 'text-red-700',
    bgColor: 'bg-red-600 text-white border-red-600',
    hoverColor: 'hover:bg-red-50 hover:text-red-700 hover:border-red-300',
    icon: <TrendingDown className="h-4 w-4" />,
  },
  {
    value: -1,
    label: '看空',
    shortLabel: '看空',
    color: 'text-red-600',
    bgColor: 'bg-red-100 text-red-700 border-red-200',
    hoverColor: 'hover:bg-red-50 hover:text-red-600 hover:border-red-200',
    icon: <TrendingDown className="h-4 w-4" />,
  },
  {
    value: 0,
    label: '中立',
    shortLabel: '中立',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100 text-gray-700 border-gray-200',
    hoverColor: 'hover:bg-gray-50 hover:text-gray-600 hover:border-gray-200',
    icon: <Minus className="h-4 w-4" />,
  },
  {
    value: 1,
    label: '看多',
    shortLabel: '看多',
    color: 'text-green-600',
    bgColor: 'bg-green-100 text-green-700 border-green-200',
    hoverColor: 'hover:bg-green-50 hover:text-green-600 hover:border-green-200',
    icon: <TrendingUp className="h-4 w-4" />,
  },
  {
    value: 2,
    label: '強烈看多',
    shortLabel: '強多',
    color: 'text-green-700',
    bgColor: 'bg-green-600 text-white border-green-600',
    hoverColor: 'hover:bg-green-50 hover:text-green-700 hover:border-green-300',
    icon: <TrendingUp className="h-4 w-4" />,
  },
];

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
  /** AI 建議的情緒值 */
  aiSuggestion?: Sentiment | null;
  /** 採用 AI 建議的回調 */
  onAcceptAiSuggestion?: () => void;
}

export function SentimentSelector({
  value,
  onChange,
  disabled = false,
  className,
  showIcon = true,
  shortLabel = false,
  aiSuggestion,
  onAcceptAiSuggestion,
}: SentimentSelectorProps) {
  const aiSuggestionOption = React.useMemo(() => {
    if (aiSuggestion === null || aiSuggestion === undefined) return null;
    return SENTIMENT_OPTIONS.find((opt) => opt.value === aiSuggestion);
  }, [aiSuggestion]);

  return (
    <div className={cn('space-y-3', className)}>
      {/* 情緒選擇按鈕 */}
      <div className="flex flex-wrap gap-2">
        {SENTIMENT_OPTIONS.map((option) => {
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

      {/* AI 建議 */}
      {aiSuggestionOption && value !== aiSuggestion && (
        <div className="border-primary/50 bg-primary/5 flex items-center gap-2 rounded-lg border border-dashed p-3">
          <Sparkles className="text-primary h-4 w-4" />
          <span className="flex-1 text-sm">
            AI 建議：
            <span className={cn('ml-1 font-medium', aiSuggestionOption.color)}>
              {aiSuggestionOption.label}
            </span>
          </span>
          {onAcceptAiSuggestion && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAcceptAiSuggestion}
              disabled={disabled}
            >
              採用
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// 取得情緒選項的輔助函數
export function getSentimentOption(sentiment: Sentiment | null): SentimentOption | null {
  if (sentiment === null) return null;
  return SENTIMENT_OPTIONS.find((opt) => opt.value === sentiment) || null;
}

// 取得情緒顯示文字
export function getSentimentLabel(sentiment: Sentiment | null, short = false): string {
  const option = getSentimentOption(sentiment);
  if (!option) return '未設定';
  return short ? option.shortLabel : option.label;
}

// 取得情緒顏色 class
export function getSentimentColorClass(sentiment: Sentiment | null): string {
  const option = getSentimentOption(sentiment);
  return option?.color || 'text-gray-500';
}
