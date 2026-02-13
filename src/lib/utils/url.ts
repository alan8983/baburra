// URL 偵測工具函式 — 共用於 client hooks 與 server API routes

/** 目前支援自動擷取的平台 */
const SUPPORTED_PATTERNS: { platform: string; pattern: RegExp }[] = [
  { platform: 'Twitter / X', pattern: /twitter\.com|x\.com/i },
];

/** 預計未來支援的平台 (Release 02) — 需要 Meta Developer App */
const PLANNED_PATTERNS: { platform: string; pattern: RegExp }[] = [
  { platform: 'Facebook', pattern: /facebook\.com|fb\.com|fb\.watch/i },
  { platform: 'Threads', pattern: /threads\.net/i },
];

/**
 * 判斷文字是否為 URL 格式
 */
export function isUrlLike(text: string): boolean {
  return /^https?:\/\/\S+/.test(text.trim());
}

/**
 * 判斷 URL 是否為支援自動擷取的平台
 * 回傳平台名稱，不支援則回傳 null
 */
export function getSupportedPlatform(text: string): string | null {
  const trimmed = text.trim();
  for (const { platform, pattern } of SUPPORTED_PATTERNS) {
    if (pattern.test(trimmed)) return platform;
  }
  return null;
}

/**
 * 判斷 URL 是否為預計未來支援的平台
 * 回傳平台名稱，不符合則回傳 null
 */
export function getPlannedPlatform(text: string): string | null {
  const trimmed = text.trim();
  for (const { platform, pattern } of PLANNED_PATTERNS) {
    if (pattern.test(trimmed)) return platform;
  }
  return null;
}

/**
 * 取得支援的平台列表（用於顯示給使用者）
 */
export function getSupportedPlatformNames(): string[] {
  return SUPPORTED_PATTERNS.map((p) => p.platform);
}

/**
 * 取得預計支援的平台列表
 */
export function getPlannedPlatformNames(): string[] {
  return PLANNED_PATTERNS.map((p) => p.platform);
}
