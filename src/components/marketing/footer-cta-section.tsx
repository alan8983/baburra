import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';

export async function FooterCtaSection() {
  const t = await getTranslations('landing');

  return (
    <>
      {/* CTA Banner */}
      <section className="bg-primary text-primary-foreground px-4 py-20 text-center sm:px-6">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold">{t('footerCta.title')}</h2>
          <p className="text-primary-foreground/80 mt-4">{t('footerCta.subtitle')}</p>
          <Button asChild size="lg" variant="secondary" className="mt-8 text-base">
            <Link href={ROUTES.REGISTER}>{t('footerCta.cta')}</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-muted-foreground text-sm">
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-muted-foreground hover:text-foreground text-sm">
              {t('footer.privacy')}
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground text-sm">
              {t('footer.terms')}
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
