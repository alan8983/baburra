import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants/routes';

const freeFeatureKeys = ['kolFollows', 'aiAnalyses', 'basicCharts', 'winRate'] as const;
const proFeatureKeys = [
  'kolFollows',
  'aiAnalyses',
  'advancedCharts',
  'argumentExtraction',
  'prioritySupport',
] as const;

export async function PricingSection() {
  const t = await getTranslations('landing.pricing');

  return (
    <section id="pricing" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-bold">{t('title')}</h2>
        <p className="text-muted-foreground mt-3 text-center">{t('subtitle')}</p>

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {/* Free Plan */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{t('free.name')}</CardTitle>
              <CardDescription>{t('free.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <span className="text-4xl font-bold">
                  {t('currency')}
                  {t('free.price')}
                </span>
                <span className="text-muted-foreground">{t('period')}</span>
              </div>
              <ul className="space-y-3">
                {freeFeatureKeys.map((key) => (
                  <li key={key} className="flex items-center gap-2 text-sm">
                    <Check className="text-primary size-4" />
                    {t(`free.features.${key}`)}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild variant="outline" className="w-full">
                <Link href={ROUTES.REGISTER}>{t('free.cta')}</Link>
              </Button>
            </CardFooter>
          </Card>

          {/* Pro Plan */}
          <Card className="border-primary relative shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">{t('pro.name')}</CardTitle>
                <Badge>{t('pro.badge')}</Badge>
              </div>
              <CardDescription>{t('pro.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <span className="text-4xl font-bold">
                  {t('currency')}
                  {t('pro.price')}
                </span>
                <span className="text-muted-foreground">{t('period')}</span>
              </div>
              <ul className="space-y-3">
                {proFeatureKeys.map((key) => (
                  <li key={key} className="flex items-center gap-2 text-sm">
                    <Check className="text-primary size-4" />
                    {t(`pro.features.${key}`)}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full">
                <Link href={ROUTES.REGISTER}>{t('pro.cta')}</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </section>
  );
}
