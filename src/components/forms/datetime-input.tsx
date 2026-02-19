'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { Calendar, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// 快捷時間選項
interface QuickTimeOption {
  label: string;
  getTime: () => Date;
}

// 將 Date 轉換為 datetime-local 格式
function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 將 datetime-local 格式轉換為 Date
function parseDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

export interface DatetimeInputProps {
  /** 選中的時間 */
  value: Date | null;
  /** 時間變更回調 */
  onChange: (date: Date | null) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自訂 className */
  className?: string;
  /** 標籤 */
  label?: string;
  /** 是否必填 */
  required?: boolean;
  /** 是否顯示快捷按鈕 */
  showQuickOptions?: boolean;
  /** 最小時間 */
  min?: Date;
  /** 最大時間 */
  max?: Date;
}

export function DatetimeInput({
  value,
  onChange,
  disabled = false,
  className,
  label,
  required = false,
  showQuickOptions = true,
  min,
  max,
}: DatetimeInputProps) {
  const t = useTranslations('forms');
  const locale = useLocale();

  const QUICK_TIME_OPTIONS: QuickTimeOption[] = [
    {
      label: t('datetimeInput.quickOptions.now'),
      getTime: () => new Date(),
    },
    {
      label: t('datetimeInput.quickOptions.1hAgo'),
      getTime: () => {
        const date = new Date();
        date.setHours(date.getHours() - 1);
        return date;
      },
    },
    {
      label: t('datetimeInput.quickOptions.3hAgo'),
      getTime: () => {
        const date = new Date();
        date.setHours(date.getHours() - 3);
        return date;
      },
    },
    {
      label: t('datetimeInput.quickOptions.1dAgo'),
      getTime: () => {
        const date = new Date();
        date.setDate(date.getDate() - 1);
        return date;
      },
    },
    {
      label: t('datetimeInput.quickOptions.3dAgo'),
      getTime: () => {
        const date = new Date();
        date.setDate(date.getDate() - 3);
        return date;
      },
    },
    {
      label: t('datetimeInput.quickOptions.1wAgo'),
      getTime: () => {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        return date;
      },
    },
  ];

  // 將 Date 轉換為 input value
  const inputValue = React.useMemo(() => {
    return value ? formatDateTimeLocal(value) : '';
  }, [value]);

  // 處理 input 變更
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const date = parseDateTimeLocal(newValue);
    onChange(date);
  };

  // 處理快捷按鈕點擊
  const handleQuickOption = (option: QuickTimeOption) => {
    const date = option.getTime();
    onChange(date);
  };

  // 取得 min/max 的 input 格式
  const minValue = min ? formatDateTimeLocal(min) : undefined;
  const maxValue = max ? formatDateTimeLocal(max) : undefined;

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}

      {/* 時間輸入 */}
      <div className="relative">
        <Calendar className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          type="datetime-local"
          value={inputValue}
          onChange={handleInputChange}
          disabled={disabled}
          min={minValue}
          max={maxValue}
          className="pl-10"
        />
      </div>

      {/* 快捷按鈕 */}
      {showQuickOptions && (
        <div className="flex flex-wrap gap-2">
          {QUICK_TIME_OPTIONS.map((option) => (
            <Button
              key={option.label}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => handleQuickOption(option)}
              className="h-7 text-xs"
            >
              <Clock className="mr-1 h-3 w-3" />
              {option.label}
            </Button>
          ))}
        </div>
      )}

      {/* 顯示已選時間 */}
      {value && (
        <p className="text-muted-foreground text-xs">
          {t('datetimeInput.selected')}
          {value.toLocaleString(locale, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'short',
          })}
        </p>
      )}
    </div>
  );
}

// 格式化相對時間的輔助函數
export function formatRelativeTime(
  date: Date,
  t: (key: string, values?: Record<string, unknown>) => string
): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return t('datetimeInput.justNow');
  } else if (diffMins < 60) {
    return t('datetimeInput.minutesAgo', { count: diffMins });
  } else if (diffHours < 24) {
    return t('datetimeInput.hoursAgo', { count: diffHours });
  } else if (diffDays < 7) {
    return t('datetimeInput.daysAgo', { count: diffDays });
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return t('datetimeInput.weeksAgo', { count: weeks });
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return t('datetimeInput.monthsAgo', { count: months });
  } else {
    const years = Math.floor(diffDays / 365);
    return t('datetimeInput.yearsAgo', { count: years });
  }
}
