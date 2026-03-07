import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';

export async function HeroSection() {
  const t = await getTranslations('landing.hero');

  return (
    <section className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">{t('title')}</h1>
        <p className="text-muted-foreground mt-6 text-lg sm:text-xl">{t('subtitle')}</p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button asChild size="lg" className="text-base">
            <Link href={ROUTES.REGISTER}>{t('cta')}</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="text-base">
            <a href="#features">{t('ctaSecondary')}</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
