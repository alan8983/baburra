'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Youtube, Twitter, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { DiscoveredUrl } from '@/infrastructure/extractors';

interface UrlDiscoveryListProps {
  kolName: string;
  kolAvatarUrl: string | null;
  platform: string;
  discoveredUrls: DiscoveredUrl[];
  onConfirm: (selectedUrls: string[]) => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export function UrlDiscoveryList({
  kolName,
  kolAvatarUrl,
  platform,
  discoveredUrls,
  onConfirm,
  onBack,
  isSubmitting,
}: UrlDiscoveryListProps) {
  const t = useTranslations('scrape.discover');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(discoveredUrls.map((u) => u.url))
  );

  const allSelected = selected.size === discoveredUrls.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(discoveredUrls.map((u) => u.url)));
    }
  };

  const toggleOne = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const PlatformIcon = platform === 'youtube' ? Youtube : Twitter;
  const platformColor = platform === 'youtube' ? 'text-red-500' : 'text-sky-500';

  const formatDate = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    return (dateStr?: string) => {
      if (!dateStr) return null;
      try {
        return fmt.format(new Date(dateStr));
      } catch {
        return null;
      }
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={kolAvatarUrl ?? undefined} alt={kolName} />
            <AvatarFallback>{kolName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              {kolName}
              <PlatformIcon className={`h-4 w-4 shrink-0 ${platformColor}`} />
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {t('found', { count: discoveredUrls.length })} &bull;{' '}
              {t('selected', { count: selected.size })}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Select all toggle */}
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={isSubmitting} />
            {allSelected ? t('deselectAll') : t('selectAll')}
          </label>
        </div>

        {/* URL list */}
        <ScrollArea className="h-[360px] rounded-md border">
          <div className="divide-y">
            {discoveredUrls.map((item) => {
              const date = formatDate(item.publishedAt);
              return (
                <label
                  key={item.url}
                  className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 px-3 py-2.5"
                >
                  <Checkbox
                    checked={selected.has(item.url)}
                    onCheckedChange={() => toggleOne(item.url)}
                    disabled={isSubmitting}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{item.title || item.url}</p>
                    {date && <p className="text-muted-foreground text-xs">{date}</p>}
                  </div>
                </label>
              );
            })}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('back')}
          </Button>
          <Button
            className="flex-1"
            onClick={() => onConfirm(Array.from(selected))}
            disabled={selected.size === 0 || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('confirm')}
              </>
            ) : (
              t('confirm')
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
