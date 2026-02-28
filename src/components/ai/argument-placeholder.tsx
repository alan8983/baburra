'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Construction } from 'lucide-react';

export function ArgumentPlaceholder() {
  const t = useTranslations('common');

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <Construction className="text-muted-foreground h-8 w-8" />
        <div className="space-y-1">
          <div className="flex items-center justify-center gap-2">
            <span className="font-medium">{t('ai.argumentAnalysis')}</span>
            <Badge variant="outline" className="text-muted-foreground text-[10px] font-normal">
              {t('ai.underDevelopment')}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">{t('ai.argumentComingSoon')}</p>
        </div>
      </CardContent>
    </Card>
  );
}
