import { getTranslations } from 'next-intl/server';

const faqKeys = ['whatIs', 'platforms', 'freeLimits', 'upgrade', 'dataSecurity'] as const;

export async function FaqSection() {
  const t = await getTranslations('landing.faq');

  return (
    <section id="faq" className="bg-muted/40 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-3xl font-bold">{t('title')}</h2>
        <div className="mt-12 space-y-4">
          {faqKeys.map((key) => (
            <details
              key={key}
              className="group bg-background rounded-lg border px-6 py-4 [&[open]>summary]:mb-3"
            >
              <summary className="cursor-pointer list-none font-medium [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between">
                  {t(`items.${key}.q`)}
                  <span className="text-muted-foreground ml-2 transition-transform group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="text-muted-foreground text-sm leading-relaxed">{t(`items.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
