// 日期處理工具函數

import { format, formatDistanceToNow, parseISO, isValid, type Locale } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { enUS } from 'date-fns/locale';

const DATE_FNS_LOCALES: Record<string, Locale> = { 'zh-TW': zhTW, en: enUS };
function getDateFnsLocale(locale?: string): Locale {
  return DATE_FNS_LOCALES[locale ?? 'zh-TW'] ?? zhTW;
}

/**
 * 格式化日期為標準格式
 */
export function formatDate(date: Date | string, formatStr = 'yyyy/MM/dd', locale?: string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '-';
  return format(d, formatStr, { locale: getDateFnsLocale(locale) });
}

/**
 * 格式化日期時間
 */
export function formatDateTime(date: Date | string): string {
  return formatDate(date, 'yyyy/MM/dd HH:mm');
}

/**
 * 格式化為相對時間 (例如: "2小時前")
 */
export function formatRelativeTime(date: Date | string, locale?: string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '-';
  return formatDistanceToNow(d, { addSuffix: true, locale: getDateFnsLocale(locale) });
}

/**
 * 格式化為 K 線圖時間格式 (YYYY-MM-DD)
 */
export function formatChartTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '';
  return format(d, 'yyyy-MM-dd');
}

/**
 * 解析日期字串
 */
export function parseDate(dateStr: string): Date | null {
  const d = parseISO(dateStr);
  return isValid(d) ? d : null;
}

/**
 * 計算兩個日期之間的天數
 */
export function daysBetween(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
