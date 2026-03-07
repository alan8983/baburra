import { getTranslations } from 'next-intl/server';
import { HelpCircle, Clock, BarChart3 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const icons = [HelpCircle, Clock, BarChart3] as const;
const keys = ['tooMany', 'tooTiring', 'noMetrics'] as const;

export async function PainPointsSection() {
  const t = await getTranslations('landing.painPoints');

  return (
    <section className="bg-muted/40 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-bold">{t('title')}</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {keys.map((key, i) => {
            const Icon = icons[i];
            return (
              <Card key={key}>
                <CardHeader>
                  <Icon className="text-primary size-8" />
                  <CardTitle className="mt-2">{t(`items.${key}.title`)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">{t(`items.${key}.description`)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
