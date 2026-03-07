'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Menu, X, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { APP_CONFIG } from '@/lib/constants/config';
import { locales, localeCookieName, localeNames, type Locale } from '@/i18n/config';

export function LandingNav() {
  const t = useTranslations('landing.nav');
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();

  const navLinks = [
    { label: t('features'), href: '#features' },
    { label: t('pricing'), href: '#pricing' },
    { label: t('faq'), href: '#faq' },
  ];

  function switchLocale() {
    const current = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${localeCookieName}=`))
      ?.split('=')[1] as Locale | undefined;
    const next = current === 'en' ? 'zh-TW' : 'en';
    document.cookie = `${localeCookieName}=${next};path=/;max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  return (
    <nav className="bg-background/80 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href={ROUTES.HOME} className="text-xl font-bold tracking-tight">
          {APP_CONFIG.APP_NAME}
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              {link.label}
            </a>
          ))}

          <button
            onClick={switchLocale}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <Globe className="size-4" />
            {locales.map((l) => localeNames[l]).join(' / ')}
          </button>

          <Link href={ROUTES.LOGIN} className="text-sm font-medium hover:underline">
            {t('login')}
          </Link>

          <Button asChild size="sm">
            <Link href={ROUTES.REGISTER}>{t('freeTrial')}</Link>
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="bg-background border-t px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-muted-foreground text-sm font-medium"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <button
              onClick={switchLocale}
              className="text-muted-foreground flex items-center gap-1.5 text-sm"
            >
              <Globe className="size-4" />
              {locales.map((l) => localeNames[l]).join(' / ')}
            </button>
            <Link
              href={ROUTES.LOGIN}
              className="text-sm font-medium"
              onClick={() => setMobileOpen(false)}
            >
              {t('login')}
            </Link>
            <Button asChild size="sm" className="w-full">
              <Link href={ROUTES.REGISTER}>{t('freeTrial')}</Link>
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
