'use client';

import { useTranslations } from 'next-intl';
import { Target, Gift } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface FirstTimeHeroProps {
  onSelectPreset: (url: string) => void;
}

export function FirstTimeHero({ onSelectPreset }: FirstTimeHeroProps) {
  const t = useTranslations('scrape.hero');

  const presets = [
    { name: t('preset1Name'), url: t('preset1Url') },
    { name: t('preset2Name'), url: t('preset2Url') },
    { name: t('preset3Name'), url: t('preset3Url') },
  ];

  return (
    <Card className="border-primary/20 from-primary/5 to-primary/10 bg-gradient-to-br">
      <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
        <Target className="text-primary h-10 w-10" />
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-sm">
          <Gift className="h-3.5 w-3.5" />
          {t('freeBadge')}
        </Badge>
        <div className="mt-2 space-y-2">
          <p className="text-muted-foreground text-sm">{t('presetHint')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.url}
                variant="outline"
                size="sm"
                onClick={() => onSelectPreset(preset.url)}
              >
                {preset.name}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
