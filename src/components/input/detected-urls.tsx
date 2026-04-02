import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getPlatformIconByUrl } from '@/components/ui/platform-icons';
import type { ParsedInput } from '@/lib/utils/parse-input-content';

const MAX_URLS = 5;

interface DetectedUrlsProps {
  parsed: ParsedInput;
}

export function DetectedUrls({ parsed }: DetectedUrlsProps) {
  const t = useTranslations('input');
  const urlSegments = parsed.segments.filter((s) => s.isUrl);

  if (urlSegments.length === 0) return null;

  const tooManyUrls = parsed.mode === 'urls' && parsed.urls.length > MAX_URLS;

  return (
    <div className="space-y-2">
      {/* Detected URLs list */}
      <div className="flex flex-wrap gap-1.5">
        {urlSegments.map((seg, i) => (
          <Badge
            key={i}
            variant={seg.platform ? 'secondary' : 'destructive'}
            className="gap-1 text-xs font-normal"
          >
            {getPlatformIconByUrl(seg.text, 'h-3.5 w-3.5')}
            <span className="max-w-[200px] truncate">{seg.text}</span>
          </Badge>
        ))}
      </div>

      {/* Mode indicator */}
      <p className="text-muted-foreground text-xs">
        {parsed.mode === 'urls' ? t('detection.modeUrls') : t('detection.modeText')}
      </p>

      {/* Warnings */}
      {parsed.hasUnsupportedUrls && (
        <p className="text-destructive flex items-center gap-1 text-xs">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t('detection.unsupportedUrl')}
        </p>
      )}
      {tooManyUrls && (
        <p className="text-destructive flex items-center gap-1 text-xs">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t('detection.tooManyUrls', { max: MAX_URLS })}
        </p>
      )}
    </div>
  );
}
