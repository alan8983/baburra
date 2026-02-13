'use client';

import { useTranslations } from 'next-intl';
import { Sparkles, Plus, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { IdentifiedTicker } from '@/hooks/use-ai';
import type { StockSearchResult } from '@/domain/models';

export interface AiTickerSuggestionsProps {
  suggestions: IdentifiedTicker[];
  existingStocks: StockSearchResult[];
  onAccept: (ticker: IdentifiedTicker) => void;
  onAcceptAll: () => void;
  onDismiss: () => void;
  isLoading?: boolean;
}

export function AiTickerSuggestions({
  suggestions,
  existingStocks,
  onAccept,
  onAcceptAll,
  onDismiss,
  isLoading = false,
}: AiTickerSuggestionsProps) {
  const t = useTranslations('common.ai');

  if (isLoading) {
    return (
      <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          {t('identifyingTickers')}
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  const existingTickerSet = new Set(existingStocks.map((s) => s.ticker.toUpperCase()));

  const unaddedSuggestions = suggestions.filter(
    (s) => !existingTickerSet.has(s.ticker.toUpperCase())
  );

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('tickersFound', { count: suggestions.length })}
        </div>
        <div className="flex items-center gap-2">
          {unaddedSuggestions.length > 1 && (
            <Button type="button" variant="outline" size="sm" onClick={onAcceptAll}>
              {t('addAllTickers')}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {suggestions.map((ticker) => {
          const alreadyAdded = existingTickerSet.has(ticker.ticker.toUpperCase());
          return (
            <div
              key={ticker.ticker}
              className="flex items-center justify-between rounded-md bg-background p-2"
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono font-semibold">
                  {ticker.ticker}
                </Badge>
                <span className="text-sm">{ticker.name}</span>
                {ticker.mentionedAs !== ticker.name &&
                  ticker.mentionedAs !== ticker.ticker && (
                    <span className="text-xs text-muted-foreground">
                      ({t('mentionedAs')} &quot;{ticker.mentionedAs}&quot;)
                    </span>
                  )}
              </div>
              {alreadyAdded ? (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('alreadyAdded')}
                </span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAccept(ticker)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {t('addTicker')}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
