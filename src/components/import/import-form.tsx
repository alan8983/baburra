'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X, Loader2, Link } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  estimateImportTime,
  formatTimeEstimate,
  type UrlEstimateInput,
} from '@/lib/utils/estimate-import-time';
import { composeCost, type Recipe } from '@/domain/models/credit-blocks';

const TEXT_RECIPE: Recipe = [
  { block: 'scrape.html', units: 1 },
  { block: 'ai.analyze.short', units: 1 },
];

function youtubeEstimateRecipe(durationSeconds: number): Recipe {
  // Without metadata, assume captionless long video at the given (default 10min) duration.
  const minutes = Math.ceil(durationSeconds / 60);
  return [
    { block: 'scrape.youtube_meta', units: 1 },
    { block: 'download.audio.long', units: minutes },
    { block: 'transcribe.audio', units: minutes },
    { block: 'ai.analyze.short', units: 1 },
  ];
}
import { getPlatformIconByUrl } from '@/components/ui/platform-icons';

const MAX_URLS = 5;

const SUPPORTED_URL_PATTERNS = [
  /^https?:\/\/(www\.)?(twitter|x)\.com\/[\w]+\/status\/[\d]+/,
  /^https?:\/\/mobile\.(twitter|x)\.com\/[\w]+\/status\/[\d]+/,
  /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
  /^https?:\/\/youtu\.be\/[\w-]+/,
  /^https?:\/\/m\.youtube\.com\/watch\?v=[\w-]+/,
  /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/,
  /^https?:\/\/vm\.tiktok\.com\/[\w]+/,
  /^https?:\/\/(www\.)?facebook\.com\/[\w.-]+\/posts\//,
  /^https?:\/\/(www\.)?facebook\.com\/permalink\.php\?story_fbid=/,
  /^https?:\/\/(www\.)?facebook\.com\/share\/p\//,
];

function isUrlSupported(url: string): boolean {
  return SUPPORTED_URL_PATTERNS.some((p) => p.test(url.trim()));
}

interface ImportFormProps {
  onSubmit: (urls: string[]) => void;
  isLoading: boolean;
}

export function ImportForm({ onSubmit, isLoading }: ImportFormProps) {
  const t = useTranslations('import');
  const [urls, setUrls] = useState<string[]>(['']);

  const validUrls = useMemo(() => urls.filter((u) => u.trim()), [urls]);

  const hasInvalidUrls = useMemo(() => validUrls.some((u) => !isUrlSupported(u)), [validUrls]);

  const canSubmit = validUrls.length > 0 && !hasInvalidUrls && !isLoading;

  // Estimate credit cost and processing time
  const estimate = useMemo(() => {
    if (validUrls.length === 0) return null;
    const urlInputs: UrlEstimateInput[] = validUrls.map((u) => {
      const trimmed = u.trim();
      if (/youtube\.com|youtu\.be/i.test(trimmed)) {
        // Without pre-fetch metadata, assume captionless + default duration
        return { platform: 'youtube' as const, hasCaptions: false, durationSeconds: null };
      }
      return { platform: 'twitter' as const };
    });

    const timeEst = estimateImportTime(urlInputs);

    // Estimate credits via lego recipes (defaults: 10min YouTube, text post).
    let credits = 0;
    for (const input of urlInputs) {
      if (input.platform === 'youtube') {
        credits += composeCost(youtubeEstimateRecipe(input.durationSeconds || 600));
      } else {
        credits += composeCost(TEXT_RECIPE);
      }
    }

    return { credits, time: formatTimeEstimate(timeEst.batch) };
  }, [validUrls]);

  const handleAddUrl = () => {
    if (urls.length < MAX_URLS) {
      setUrls([...urls, '']);
    }
  };

  const handleRemoveUrl = (index: number) => {
    if (urls.length > 1) {
      setUrls(urls.filter((_, i) => i !== index));
    } else {
      setUrls(['']);
    }
  };

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(validUrls.map((u) => u.trim()));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('form.urlLabel')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* URL List */}
          <div className="space-y-3">
            <Label>{t('form.urlLabel')}</Label>
            {urls.map((url, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-shrink-0">
                  {url.trim() ? (
                    getPlatformIconByUrl(url)
                  ) : (
                    <Link className="text-muted-foreground h-4 w-4" />
                  )}
                </div>
                <Input
                  value={url}
                  onChange={(e) => handleUrlChange(index, e.target.value)}
                  placeholder={t('form.urlPlaceholder')}
                  disabled={isLoading}
                  className={
                    url.trim() && !isUrlSupported(url)
                      ? 'border-destructive focus-visible:ring-destructive'
                      : ''
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => handleRemoveUrl(index)}
                  disabled={isLoading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {/* Add URL button */}
            {urls.length < MAX_URLS && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddUrl}
                disabled={isLoading}
              >
                <Plus className="mr-1 h-4 w-4" />
                {t('form.addUrl')}
              </Button>
            )}

            {/* Helper text */}
            <p className="text-muted-foreground text-xs">
              {t('form.supportedPlatforms')} &middot; {t('form.maxUrls', { max: MAX_URLS })}
            </p>
            <p className="text-muted-foreground text-xs">{t('form.supportedMarkets')}</p>
          </div>

          {/* Onboarding badge */}
          <Badge variant="secondary" className="text-xs">
            {t('form.onboardingHint')}
          </Badge>

          {/* Validation errors */}
          {hasInvalidUrls && (
            <p className="text-destructive text-sm">{t('errors.unsupportedUrl')}</p>
          )}

          {/* Cost & time estimate */}
          {estimate && canSubmit && (
            <p className="text-muted-foreground text-center text-sm">
              {estimate.credits} {t('form.credits')} &middot; {estimate.time}
            </p>
          )}

          {/* Submit */}
          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {isLoading ? (
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
