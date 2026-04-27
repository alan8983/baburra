'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown, Minus, Activity, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import {
  calculateReturnRateStats,
  getSqrQualitativeLabel,
  type PostForReturnRate,
  type WinRateStats,
} from '@/domain/calculators';
import { PeriodSelector } from '@/components/shared/period-selector';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InsufficientDataBadge } from '@/components/shared/insufficient-data-badge';
import { useProfile } from '@/hooks/use-profile';
import {
  DEFAULT_WIN_RATE_PERIOD,
  WIN_RATE_PERIOD_TO_BUCKET,
  type WinRatePeriod,
} from '@/domain/models/user';
import type { PostWithPriceChanges } from '@/domain/models';
import type { Sentiment } from '@/domain/models/post';

interface PortfolioPulseProps {
  posts: PostWithPriceChanges[];
  /** Server-computed full per-period win-rate stats from the dashboard endpoint. */
  pulseStats: WinRateStats;
}

export function PortfolioPulse({ posts, pulseStats }: PortfolioPulseProps) {
  const t = useTranslations('dashboard');
  const tMetrics = useTranslations('common.metrics');
  const { colors } = useColorPalette();
  const { data: profile } = useProfile();

  const [override, setOverride] = useState<WinRatePeriod | null>(null);
  const selectedPeriod: WinRatePeriod =
    override ?? profile?.defaultWinRatePeriod ?? DEFAULT_WIN_RATE_PERIOD;

  const selectedBucket = pulseStats[WIN_RATE_PERIOD_TO_BUCKET[selectedPeriod]];

  // Average return — still computed locally from existing return-rate calculator.
  const avgReturn = useMemo(() => {
    if (posts.length === 0) return null;
    const forReturn: PostForReturnRate[] = posts.map((p) => {
      const stockSentiments: Record<string, Sentiment> = {};
      for (const s of p.stocks) if (s.sentiment !== null) stockSentiments[s.id] = s.sentiment;
      return {
        id: p.id,
        sentiment: p.sentiment,
        ...(Object.keys(stockSentiments).length > 0 && { stockSentiments }),
        priceChanges: p.priceChanges ?? {},
      };
    });
    return calculateReturnRateStats(forReturn).day30.avgReturn;
  }, [posts]);

  const directionalDisplay =
    selectedBucket.directionalHitRate !== null ? selectedBucket.directionalHitRate * 100 : null;
  const directionalSampleSize = selectedBucket.directionalSampleSize;
  const directionalCorrectCount =
    directionalDisplay !== null && directionalSampleSize > 0
      ? Math.round((directionalDisplay / 100) * directionalSampleSize)
      : 0;
  const totalWithResult =
    selectedBucket.winCount + selectedBucket.loseCount + selectedBucket.noiseCount;
  const showInsufficient = directionalSampleSize > 0 && directionalSampleSize < 30;
  const sqrKey = getSqrQualitativeLabel(selectedBucket.sqr);

  const trend =
    avgReturn !== null ? (avgReturn > 0.5 ? 'up' : avgReturn < -0.5 ? 'down' : 'flat') : 'flat';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <Card className="animate-fade-up border-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Activity className="text-primary h-4 w-4" />
          {t('pulse.title')}
        </CardTitle>
        <PeriodSelector value={selectedPeriod} onChange={setOverride} />
      </CardHeader>
      <CardContent>
        {totalWithResult === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">{t('pulse.noData')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {/* Directional Hit Rate */}
            <div className="text-center">
              <div className="text-muted-foreground mb-1 flex items-center justify-center gap-1 text-xs">
                <span>{tMetrics('directionalHitRate')}</span>
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${tMetrics('directionalHitRate')} 公式`}
                      className="text-muted-foreground hover:text-foreground inline-flex h-3.5 w-3.5 items-center justify-center"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs whitespace-pre-line">
                    {tMetrics('formulaTooltip.directionalHitRate', {
                      correct: directionalCorrectCount,
                      n: directionalSampleSize,
                      value:
                        directionalDisplay !== null ? `${directionalDisplay.toFixed(1)}%` : '—',
                    })}
                  </TooltipContent>
                </Tooltip>
              </div>
              <p
                className={`text-2xl font-bold ${
                  directionalDisplay !== null && directionalDisplay >= 50
                    ? colors.bullish.text
                    : colors.bearish.text
                }`}
              >
                {directionalDisplay !== null ? (
                  <AnimatedNumber value={directionalDisplay} decimals={1} suffix="%" />
                ) : (
                  '—'
                )}
              </p>
              {showInsufficient ? (
                <InsufficientDataBadge className="mt-0.5" />
              ) : selectedBucket.sqr !== null ? (
                <p className="text-muted-foreground mt-0.5 text-[10px]">
                  SQR {selectedBucket.sqr.toFixed(2)} · {tMetrics(`sqrLabel.${sqrKey}`)}
                </p>
              ) : null}
              {selectedBucket.threshold && (
                <p className="text-muted-foreground text-[10px]">
                  ±{(selectedBucket.threshold.value * 100).toFixed(1)}% σ
                  {selectedBucket.threshold.source === 'index-fallback' && ' (idx)'}
                </p>
              )}
            </div>

            {/* Avg Return */}
            <div className="text-center">
              <p className="text-muted-foreground mb-1 text-xs">{t('pulse.avgReturn')}</p>
              <p
                className={`text-2xl font-bold ${
                  avgReturn !== null && avgReturn >= 0 ? colors.bullish.text : colors.bearish.text
                }`}
              >
                {avgReturn !== null ? (
                  <AnimatedNumber
                    value={avgReturn}
                    decimals={1}
                    prefix={avgReturn >= 0 ? '+' : ''}
                    suffix="%"
                  />
                ) : (
                  '—'
                )}
              </p>
            </div>

            {/* Trend */}
            <div className="text-center">
              <p className="text-muted-foreground mb-1 text-xs">{t('pulse.trend')}</p>
              <div className="flex items-center justify-center gap-1">
                <TrendIcon
                  className={`h-6 w-6 ${
                    trend === 'up'
                      ? colors.bullish.text
                      : trend === 'down'
                        ? colors.bearish.text
                        : 'text-muted-foreground'
                  }`}
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
