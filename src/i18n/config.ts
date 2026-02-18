// i18n 語系設定

export const locales = ['zh-TW', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'zh-TW';
export const localeCookieName = 'NEXT_LOCALE';

export const localeNames: Record<Locale, string> = {
  'zh-TW': '繁體中文',
  en: 'English',
};
