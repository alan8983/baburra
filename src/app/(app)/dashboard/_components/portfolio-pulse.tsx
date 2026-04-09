'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { calculateReturnRateStats, type PostForReturnRate } from '@/domain/calculators';
import type { PostWithPriceChanges } from '@/domain/models';
import type { WinRateBucket } from '@/domain/calculators';
import type { Sentiment } from '@/domain/models/post';

interface PortfolioPulseProps {
  posts: PostWithPriceChanges[];
  /** Server-computed day30 win-rate bucket from the dashboard endpoint. */
  pulseStats: WinRateBucket;
}

export function PortfolioPulse({ posts, pulseStats }: PortfolioPulseProps) {
  const t = useTranslations('dashboard');
  const { colors } = useColorPalette();

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

  const winRate = pulseStats.winRate != null ? pulseStats.winRate * 100 : null;
  const totalWithResult = pulseStats.winCount + pulseStats.loseCount + pulseStats.noiseCount;

  const trend =
    avgReturn !== null ? (avgReturn > 0.5 ? 'up' : avgReturn < -0.5 ? 'down' : 'flat') : 'flat';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <Card className="animate-fade-up border-2">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Activity className="text-primary h-4 w-4" />
          {t('pulse.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalWithResult === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">{t('pulse.noData')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {/* Win Rate */}
            <div className="text-center">
              <p className="text-muted-foreground mb-1 text-xs">{t('pulse.winRate')}</p>
              <p
                className={`text-2xl font-bold ${
                  winRate !== null && winRate >= 50 ? colors.bullish.text : colors.bearish.text
                }`}
              >
                {winRate !== null ? (
                  <AnimatedNumber value={winRate} decimals={1} suffix="%" />
                ) : (
                  '—'
                )}
              </p>
              {pulseStats.threshold && (
                <p className="text-muted-foreground text-[10px]">
                  ±{(pulseStats.threshold.value * 100).toFixed(1)}% σ
                  {pulseStats.threshold.source === 'index-fallback' && ' (idx)'}
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
