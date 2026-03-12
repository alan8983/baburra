'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Youtube, Twitter, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useInitiateScrape } from '@/hooks/use-scrape';

const YOUTUBE_CHANNEL_PATTERN = /^https?:\/\/(www\.)?youtube\.com\/(channel\/|c\/|@)[\w.-]+/;
const TWITTER_PROFILE_PATTERN = /^https?:\/\/(www\.)?(twitter|x)\.com\/[\w]+\/?$/;

function detectPlatform(url: string): 'youtube' | 'twitter' | null {
  const trimmed = url.trim();
  if (YOUTUBE_CHANNEL_PATTERN.test(trimmed)) return 'youtube';
  if (TWITTER_PROFILE_PATTERN.test(trimmed) && !/\/status\//.test(trimmed)) return 'twitter';
  return null;
}

interface ProfileScrapeFormProps {
  onJobCreated: (jobId: string) => void;
}

export function ProfileScrapeForm({ onJobCreated }: ProfileScrapeFormProps) {
  const t = useTranslations('scrape');
  const [url, setUrl] = useState('');
  const initiateScrape = useInitiateScrape();

  const platform = useMemo(() => detectPlatform(url), [url]);
  const isValidUrl = useMemo(() => {
    return url.trim() ? platform !== null : null;
  }, [url, platform]);

  const canSubmit = isValidUrl === true && !initiateScrape.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    initiateScrape.mutate(
      { url: url.trim() },
      {
        onSuccess: (data) => {
          onJobCreated(data.id);
        },
      }
    );
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
              {platform === 'youtube' && <Youtube className="h-5 w-5 shrink-0 text-red-500" />}
              {platform === 'twitter' && <Twitter className="h-5 w-5 shrink-0 text-sky-500" />}
              <Input
                id="scrape-url"
                type="url"
                placeholder={t('form.urlPlaceholder')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={initiateScrape.isPending}
                className={isValidUrl === false ? 'border-red-500 focus-visible:ring-red-500' : ''}
              />
            </div>
            {isValidUrl === false && <p className="text-sm text-red-500">{t('form.invalidUrl')}</p>}
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground text-xs">{t('form.supportedPlatforms')}</p>
              {platform === 'youtube' && (
                <Badge variant="secondary" className="text-xs">
                  {t('form.platformYouTube')}
                </Badge>
              )}
              {platform === 'twitter' && (
                <Badge variant="secondary" className="text-xs">
                  Twitter/X
                </Badge>
              )}
            </div>
          </div>

          {initiateScrape.isError && (
            <p className="text-sm text-red-500">{t('errors.scrapeFailed')}</p>
          )}

          <Button type="submit" disabled={!canSubmit} className="w-full">
            {initiateScrape.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('form.submitting')}
              </>
            ) : (
              t('form.submit')
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
