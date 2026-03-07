import { getTranslations } from 'next-intl/server';

const steps = ['import', 'analyze', 'review'] as const;

export async function HowItWorksSection() {
  const t = await getTranslations('landing.howItWorks');

  return (
    <section className="bg-muted/40 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-bold">{t('title')}</h2>
        <p className="text-muted-foreground mt-3 text-center">{t('subtitle')}</p>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {steps.map((key, i) => (
            <div key={key} className="relative flex flex-col items-center text-center">
              {/* Connector line (desktop only, between steps) */}
              {i < steps.length - 1 && (
                <div className="bg-border absolute top-6 left-[calc(50%+2rem)] hidden h-px w-[calc(100%-4rem)] sm:block" />
              )}
              <div className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-full text-lg font-bold">
                {t(`steps.${key}.step`)}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{t(`steps.${key}.title`)}</h3>
              <p className="text-muted-foreground mt-2 text-sm">{t(`steps.${key}.description`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
