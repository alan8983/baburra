// 格式化工具函數

/**
 * 格式化價格變動百分比
 */
export function formatPriceChange(change: number | null | undefined): string {
  if (change === null || change === undefined) return '-';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

/**
 * 格式化勝率
 */
export function formatWinRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '-';
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * 格式化數字 (加入千位分隔符)
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  return num.toLocaleString('zh-TW');
}

/**
 * 格式化股價
 */
export function formatPrice(price: number | null | undefined, decimals = 2): string {
  if (price === null || price === undefined) return '-';
  return price.toFixed(decimals);
}

/**
 * 格式化成交量
 */
export function formatVolume(volume: number | null | undefined): string {
  if (volume === null || volume === undefined) return '-';

  if (volume >= 1_000_000_000) {
    return `${(volume / 1_000_000_000).toFixed(2)}B`;
  }
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(2)}M`;
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(2)}K`;
  }
  return volume.toString();
}

/**
 * 截斷文字
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/**
 * 生成 URL-friendly slug
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
