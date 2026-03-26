'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Youtube,
  Twitter,
  Loader2,
  Captions,
  CaptionsOff,
  Sparkles,
  Gift,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAiUsage } from '@/hooks/use-ai';
import type { DiscoveredUrl } from '@/infrastructure/extractors';
import type { ContentType } from '@/infrastructure/extractors/profile-extractor';

interface UrlDiscoveryListProps {
  kolName: string;
  kolAvatarUrl: string | null;
  platform: string;
  discoveredUrls: DiscoveredUrl[];
  onConfirm: (selectedUrls: string[]) => void;
  onBack: () => void;
  isSubmitting: boolean;
  firstImportFree?: boolean;
}

const CONTENT_TYPE_COLORS: Record<ContentType, string> = {
  long_video: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  short: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  live_stream: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const CONTENT_TYPE_LABEL_KEYS: Record<ContentType, string> = {
  long_video: 'contentTypeLongVideo',
  short: 'contentTypeShort',
  live_stream: 'contentTypeLiveStream',
};

const FILTER_LABEL_KEYS: Record<ContentType, string> = {
  long_video: 'filterLongVideo',
  short: 'filterShort',
  live_stream: 'filterLiveStream',
};

export function UrlDiscoveryList({
  kolName,
  kolAvatarUrl,
  platform,
  discoveredUrls,
  onConfirm,
  onBack,
  isSubmitting,
  firstImportFree,
}: UrlDiscoveryListProps) {
  const t = useTranslations('scrape.discover');
  const tCommon = useTranslations('common');
  const { data: usage } = useAiUsage();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(discoveredUrls.map((u) => u.url))
  );

  // Content type filter state
  const [activeFilters, setActiveFilters] = useState<Set<ContentType>>(
    () => new Set(['long_video', 'short', 'live_stream'])
  );

  // Count URLs by content type
  const contentTypeCounts = useMemo(() => {
    const counts: Record<ContentType, number> = { long_video: 0, short: 0, live_stream: 0 };
    for (const item of discoveredUrls) {
      const ct = item.contentType ?? 'long_video';
      counts[ct]++;
    }
    return counts;
  }, [discoveredUrls]);

  // Only show filter bar if there's more than one content type present
  const presentTypes = useMemo(
    () =>
      (['long_video', 'short', 'live_stream'] as ContentType[]).filter(
        (ct) => contentTypeCounts[ct] > 0
      ),
    [contentTypeCounts]
  );
  const showFilters = presentTypes.length > 1;

  // Filtered URLs based on active content type filters
  const filteredUrls = useMemo(() => {
    if (!showFilters) return discoveredUrls;
    return discoveredUrls.filter((item) => activeFilters.has(item.contentType ?? 'long_video'));
  }, [discoveredUrls, activeFilters, showFilters]);

  const allFiltersActive = activeFilters.size === presentTypes.length;

  const toggleFilter = useCallback((ct: ContentType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(ct)) {
        // Don't allow deselecting all filters
        if (next.size > 1) next.delete(ct);
      } else {
        next.add(ct);
      }
      return next;
    });
  }, []);

  const toggleAllFilters = useCallback(() => {
    if (allFiltersActive) {
      // Deselect all except the first present type
      setActiveFilters(new Set([presentTypes[0]]));
    } else {
      setActiveFilters(new Set(presentTypes));
    }
  }, [allFiltersActive, presentTypes]);

  // Select all / deselect all only affects currently visible (filtered) URLs
  const visibleAllSelected =
    filteredUrls.length > 0 && filteredUrls.every((u) => selected.has(u.url));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (visibleAllSelected) {
        for (const item of filteredUrls) next.delete(item.url);
      } else {
        for (const item of filteredUrls) next.add(item.url);
      }
      return next;
    });
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

  // Calculate total estimated credits for selected URLs
  const totalEstimatedCredits = useMemo(() => {
    return discoveredUrls
      .filter((item) => selected.has(item.url))
      .reduce((sum, item) => sum + (item.estimatedCreditCost ?? 1), 0);
  }, [discoveredUrls, selected]);

  const remainingBalance = usage?.balance ?? usage?.remaining ?? 0;
  const insufficientCredits = !firstImportFree && totalEstimatedCredits > remainingBalance;

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

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
        {/* Content type filter toggles */}
        {showFilters && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={allFiltersActive ? 'default' : 'outline'}
              size="sm"
              className="h-7 rounded-full px-3 text-xs"
              onClick={toggleAllFilters}
            >
              {t('filterAll')} ({discoveredUrls.length})
            </Button>
            {presentTypes.map((ct) => (
              <Button
                key={ct}
                variant={activeFilters.has(ct) ? 'default' : 'outline'}
                size="sm"
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => toggleFilter(ct)}
              >
                {t(FILTER_LABEL_KEYS[ct])} ({contentTypeCounts[ct]})
              </Button>
            ))}
          </div>
        )}

        {/* Select all toggle */}
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={visibleAllSelected}
              onCheckedChange={toggleAll}
              disabled={isSubmitting}
            />
            {visibleAllSelected ? t('deselectAll') : t('selectAll')}
          </label>
        </div>

        {/* URL list */}
        <ScrollArea className="h-[360px] rounded-md border">
          <div className="divide-y">
            {filteredUrls.map((item) => {
              const date = formatDate(item.publishedAt);
              const duration = formatDuration(item.durationSeconds);
              const creditCost = item.estimatedCreditCost ?? 1;
              const hasCaptions = item.captionAvailable;
              const contentType = item.contentType ?? 'long_video';

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
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      {date && <span>{date}</span>}
                      {duration && <span>{duration}</span>}
                      {/* Content type tag */}
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0 text-[10px] leading-4 font-medium',
                          CONTENT_TYPE_COLORS[contentType]
                        )}
                      >
                        {t(CONTENT_TYPE_LABEL_KEYS[contentType])}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* Caption status icon (YouTube only) */}
                    {platform === 'youtube' && hasCaptions !== undefined && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              {hasCaptions ? (
                                <Captions className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <CaptionsOff className="h-3.5 w-3.5 text-amber-500" />
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {hasCaptions ? t('captionAvailable') : t('captionUnavailable')}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {/* Credit cost badge */}
                    <Badge
                      variant="outline"
                      className={`text-xs ${creditCost > 2 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
                    >
                      {creditCost}
                      <Sparkles className="ml-0.5 h-2.5 w-2.5" />
                    </Badge>
                  </div>
                </label>
              );
            })}
          </div>
        </ScrollArea>

        {/* Credit estimation footer */}
        <div className="bg-muted/30 rounded-md border px-3 py-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('estimatedCredits')}</span>
            <span className="font-medium">
              {totalEstimatedCredits} <Sparkles className="mb-0.5 inline h-3 w-3" />
            </span>
          </div>
          {usage && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('remainingBalance')}</span>
              <span className={`font-medium ${insufficientCredits ? 'text-red-600' : ''}`}>
                {remainingBalance} / {usage.weeklyLimit}
              </span>
            </div>
          )}
          {firstImportFree && (
            <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-green-600">
              <Gift className="h-3.5 w-3.5" />
              {t('firstImportFree')}
            </div>
          )}
          {insufficientCredits && (
            <p className="mt-1 text-xs text-red-600">{t('insufficientCredits')}</p>
          )}
          {platform === 'youtube' && !firstImportFree && (
            <p className="text-muted-foreground mt-1 text-xs">{t('creditNote')}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('back')}
          </Button>
          <Button
            className="flex-1"
            onClick={() => onConfirm(Array.from(selected))}
            disabled={selected.size === 0 || isSubmitting || insufficientCredits}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('confirm')}
              </>
            ) : (
              <>
                {t('confirm')}
                {totalEstimatedCredits > 0 && (
                  <span className="ml-1 opacity-70">
                    ({totalEstimatedCredits} {tCommon('ai.credits')})
                  </span>
                )}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
