import { getTranslations } from 'next-intl/server';
import { Users, Brain, CandlestickChart, Trophy, Import, FileSearch } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const features = [
  { key: 'kolTracking', icon: Users },
  { key: 'aiSentiment', icon: Brain },
  { key: 'klineBacktest', icon: CandlestickChart },
  { key: 'winRate', icon: Trophy },
  { key: 'multiPlatform', icon: Import },
  { key: 'argumentExtraction', icon: FileSearch },
] as const;

export async function FeaturesSection() {
  const t = await getTranslations('landing.features');

  return (
    <section id="features" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-bold">{t('title')}</h2>
        <p className="text-muted-foreground mt-3 text-center">{t('subtitle')}</p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ key, icon: Icon }) => (
            <Card key={key}>
              <CardHeader>
                <Icon className="text-primary size-8" />
                <CardTitle className="mt-2">{t(`items.${key}.title`)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">{t(`items.${key}.description`)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
