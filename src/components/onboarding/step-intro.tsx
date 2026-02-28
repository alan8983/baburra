'use client';

import { useTranslations } from 'next-intl';
import { BarChart3, TrendingUp, Bot, LineChart, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface StepIntroProps {
  onNext: () => void;
  onSkip: () => void;
}

function FeatureItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}

export function StepIntro({ onNext, onSkip }: StepIntroProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t('step1.title')}</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <FeatureItem
            icon={<BarChart3 className="h-5 w-5 text-blue-500" />}
            text={t('step1.features.track')}
          />
          <FeatureItem
            icon={<TrendingUp className="h-5 w-5 text-green-500" />}
            text={t('step1.features.measure')}
          />
          <FeatureItem
            icon={<Bot className="h-5 w-5 text-purple-500" />}
            text={t('step1.features.ai')}
          />
          <FeatureItem
            icon={<LineChart className="h-5 w-5 text-orange-500" />}
            text={t('step1.features.chart')}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-3">
        <Button onClick={onNext} size="lg">
          {t('step1.getStarted')}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          {t('step1.skip')}
        </Button>
      </div>
    </div>
  );
}
