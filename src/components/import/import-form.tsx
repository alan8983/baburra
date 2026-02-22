'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X, Loader2, Twitter, Youtube, Link } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

const MAX_URLS = 5;

const TWITTER_PATTERN = /twitter\.com|x\.com/i;
const YOUTUBE_PATTERN = /youtube\.com|youtu\.be/i;

const SUPPORTED_URL_PATTERNS = [
  /^https?:\/\/(www\.)?(twitter|x)\.com\/[\w]+\/status\/[\d]+/,
  /^https?:\/\/mobile\.(twitter|x)\.com\/[\w]+\/status\/[\d]+/,
  /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
  /^https?:\/\/youtu\.be\/[\w-]+/,
  /^https?:\/\/m\.youtube\.com\/watch\?v=[\w-]+/,
];

function isUrlSupported(url: string): boolean {
  return SUPPORTED_URL_PATTERNS.some((p) => p.test(url.trim()));
}

function getPlatformIcon(url: string) {
  const trimmed = url.trim();
  if (TWITTER_PATTERN.test(trimmed)) return <Twitter className="h-4 w-4 text-sky-500" />;
  if (YOUTUBE_PATTERN.test(trimmed)) return <Youtube className="h-4 w-4 text-red-500" />;
  return <Link className="text-muted-foreground h-4 w-4" />;
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
                    getPlatformIcon(url)
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
          </div>

          {/* Onboarding badge */}
          <Badge variant="secondary" className="text-xs">
            {t('form.onboardingHint')}
          </Badge>

          {/* Validation errors */}
          {hasInvalidUrls && (
            <p className="text-destructive text-sm">{t('errors.unsupportedUrl')}</p>
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
