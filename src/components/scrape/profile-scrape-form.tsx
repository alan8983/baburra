'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { getPlatformIconByName } from '@/components/ui/platform-icons';
import type { PlatformName } from '@/components/ui/platform-icons';

const YOUTUBE_CHANNEL_PATTERN = /^https?:\/\/(www\.)?youtube\.com\/(channel\/|c\/|@)[\w.-]+/;
const TWITTER_PROFILE_PATTERN = /^https?:\/\/(www\.)?(twitter|x)\.com\/[\w]+\/?$/;
const TIKTOK_PROFILE_PATTERN = /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/?$/;
const FACEBOOK_PROFILE_PATTERN = /^https?:\/\/(www\.)?facebook\.com\/[\w.-]+\/?$/;
const SPOTIFY_SHOW_PATTERN = /^https?:\/\/(open\.)?spotify\.com\/show\//;
const APPLE_PODCAST_PATTERN = /^https?:\/\/podcasts\.apple\.com\//;

const FACEBOOK_POST_EXCLUSIONS = /\/(posts|permalink|share|videos|photo|events|groups)\//;

// Mirrors isDirectRssUrl() in src/infrastructure/api/rss-resolver.ts.
// Kept inline (rather than imported) so this client component doesn't pull in
// server-only fetch code from the backend resolver module.
function isDirectRssUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return (
      path.endsWith('.xml') ||
      path.endsWith('.rss') ||
      path.endsWith('.atom') ||
      path.includes('/feed') ||
      path.includes('/rss') ||
      parsed.hostname.includes('feeds.') ||
      parsed.hostname.includes('anchor.fm') ||
      parsed.hostname.includes('feedburner')
    );
  } catch {
    return false;
  }
}

function detectPlatform(url: string): PlatformName | null {
  const trimmed = url.trim();
  if (YOUTUBE_CHANNEL_PATTERN.test(trimmed)) return 'youtube';
  if (TWITTER_PROFILE_PATTERN.test(trimmed) && !/\/status\//.test(trimmed)) return 'twitter';
  if (TIKTOK_PROFILE_PATTERN.test(trimmed) && !/\/video\//.test(trimmed)) return 'tiktok';
  if (FACEBOOK_PROFILE_PATTERN.test(trimmed) && !FACEBOOK_POST_EXCLUSIONS.test(trimmed))
    return 'facebook';
  if (SPOTIFY_SHOW_PATTERN.test(trimmed)) return 'podcast';
  if (APPLE_PODCAST_PATTERN.test(trimmed)) return 'podcast';
  if (isDirectRssUrl(trimmed)) return 'podcast';
  return null;
}

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

  const platform = useMemo(() => detectPlatform(url), [url]);
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
