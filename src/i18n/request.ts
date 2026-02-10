import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, locales, type Locale } from './config';

export default getRequestConfig(async () => {
  // 從 Cookie 讀取語系，如果沒有則使用預設語系
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  
  // 驗證語系是否有效
  const locale = (locales.includes(localeCookie as Locale) 
    ? localeCookie 
    : defaultLocale) as Locale;

  return {
    locale,
    messages: (await import(`../messages/${locale}/index.ts`)).default,
  };
});
