'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sentimentKey } from '@/lib/utils/sentiment';
import { ROUTES } from '@/lib/constants';
import type { Sentiment, PriceChangeByPeriod } from '@/domain/models/post';

type VerdictState = 'correct' | 'incorrect' | 'pending';

interface VerdictHeroProps {
  sentiment: Sentiment;
  stocks: {
    id: string;
    ticker: string;
    name: string;
    sentiment: Sentiment | null;
    source?: 'explicit' | 'inferred';
  }[];
  priceChanges: Record<string, PriceChangeByPeriod>;
  kolName: string;
}

function getVerdictState(sentiment: Sentiment, priceChange: number | null): VerdictState {
  if (priceChange === null) return 'pending';
  const isBullish = sentiment > 0;
  const isBearish = sentiment < 0;
  if (sentiment === 0) return 'pending'; // Neutral — no directional call to judge

  if (isBullish && priceChange > 0) return 'correct';
  if (isBullish && priceChange <= 0) return 'incorrect';
  if (isBearish && priceChange < 0) return 'correct';
  if (isBearish && priceChange >= 0) return 'incorrect';

  return 'pending';
}

function getBestPriceChange(pc: PriceChangeByPeriod | undefined): {
  value: number | null;
  period: string;
} {
  if (!pc) return { value: null, period: '' };
  if (pc.day5 !== null && pc.day5Status === 'value') return { value: pc.day5, period: '5d' };
  if (pc.day30 !== null && pc.day30Status === 'value') return { value: pc.day30, period: '30d' };
  if (pc.day90 !== null && pc.day90Status === 'value') return { value: pc.day90, period: '90d' };
  if (pc.day365 !== null && pc.day365Status === 'value') return { value: pc.day365, period: '1y' };
  return { value: null, period: '' };
}

const verdictConfig = {
  correct: {
    icon: Check,
    bgClass: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800',
    iconBgClass: 'bg-emerald-500',
    labelClass: 'text-emerald-700 dark:text-emerald-400',
  },
  incorrect: {
    icon: X,
    bgClass: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',
    iconBgClass: 'bg-red-500',
    labelClass: 'text-red-700 dark:text-red-400',
  },
  pending: {
    icon: Clock,
    bgClass: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
    iconBgClass: 'bg-amber-500',
    labelClass: 'text-amber-700 dark:text-amber-400',
  },
};

export function VerdictHero({ sentiment, stocks, priceChanges, kolName }: VerdictHeroProps) {
  const t = useTranslations('posts');
  const tCommon = useTranslations('common');

  const primary = useMemo(() => {
    if (stocks.length === 0) return null;
    const stock = stocks[0];
    const effectiveSentiment = stock.sentiment ?? sentiment;
    const pc = priceChanges[stock.id];
    const best = getBestPriceChange(pc);
    const verdict = getVerdictState(effectiveSentiment, best.value);
    return { stock, effectiveSentiment, best, verdict };
  }, [stocks, priceChanges, sentiment]);

  if (!primary || sentiment === 0) return null;

  const config = verdictConfig[primary.verdict];
  const Icon = config.icon;
  const sentimentLabel = tCommon(`sentiment.${sentimentKey(primary.effectiveSentiment)}`);
  const isBullish = primary.effectiveSentiment > 0;

  return (
    <div className={cn('animate-fade-up rounded-xl border-2 p-5', config.bgClass)}>
      <div className="flex items-center gap-4">
        {/* Verdict icon */}
        <div
          className={cn(
            'flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white',
            config.iconBgClass
          )}
        >
          <Icon className="h-7 w-7" strokeWidth={3} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {/* KOL's call */}
            <p className="text-muted-foreground text-sm font-medium">
              {kolName} {t('detail.verdict.said')}
            </p>
            <span
              className={cn(
                'text-lg font-bold',
                isBullish
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              )}
            >
              {sentimentLabel}
            </span>
            <span className="text-muted-foreground">→</span>
            {/* Result */}
            {primary.best.value !== null ? (
              <span
                className={cn(
                  'text-lg font-bold',
                  primary.best.value >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {primary.best.value >= 0 ? '+' : ''}
                {primary.best.value.toFixed(1)}%
                <span className="text-muted-foreground ml-1 text-sm font-normal">
                  ({primary.best.period})
                </span>
              </span>
            ) : (
              <span className={cn('text-lg font-bold', config.labelClass)}>
                {t('detail.verdict.pendingResult')}
              </span>
            )}
          </div>

          {/* Verdict label */}
          <p className={cn('mt-1 text-sm font-semibold', config.labelClass)}>
            {primary.stock.ticker} · {primary.verdict === 'correct' && t('detail.verdict.correct')}
            {primary.verdict === 'incorrect' && t('detail.verdict.incorrect')}
            {primary.verdict === 'pending' && t('detail.verdict.pending')}
          </p>

          {/* Multi-stock note */}
          {stocks.length > 1 && (
            <p className="text-muted-foreground mt-1 text-xs">
              {t('detail.verdict.moreStocks', { count: stocks.length - 1 })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
