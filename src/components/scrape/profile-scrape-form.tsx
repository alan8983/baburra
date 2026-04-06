'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { getPlatformIconByName } from '@/components/ui/platform-icons';
import { detectProfilePlatform } from '@/lib/utils/detect-profile-platform';

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  twitter: 'Twitter/X',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  podcast: 'Podcast',
};

interface ProfileScrapeFormProps {
  onJobCreated: (url: string) => void;
  initialUrl?: string;
}

export function ProfileScrapeForm({ onJobCreated, initialUrl }: ProfileScrapeFormProps) {
  const t = useTranslations('scrape');
  const [url, setUrl] = useState(initialUrl ?? '');

  const platform = useMemo(() => detectProfilePlatform(url), [url]);
  const isValidUrl = useMemo(() => {
    return url.trim() ? platform !== null : null;
  }, [url, platform]);

  const canSubmit = isValidUrl === true;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onJobCreated(url.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scrape-url">{t('form.urlLabel')}</Label>
            <div className="flex items-center gap-2">
              {platform && getPlatformIconByName(platform, 'h-5 w-5 shrink-0')}
              <Input
                id="scrape-url"
                type="url"
                placeholder={t('form.urlPlaceholder')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={isValidUrl === false ? 'border-red-500 focus-visible:ring-red-500' : ''}
              />
            </div>
            {isValidUrl === false && <p className="text-sm text-red-500">{t('form.invalidUrl')}</p>}
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground text-xs">{t('form.supportedPlatforms')}</p>
              {platform && (
                <Badge variant="secondary" className="text-xs">
                  {PLATFORM_LABELS[platform] ?? platform}
                </Badge>
              )}
            </div>
          </div>

          <Button type="submit" disabled={!canSubmit} className="w-full">
            {t('form.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
