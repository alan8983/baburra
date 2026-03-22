'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import type { PostWithPriceChanges } from '@/domain/models';

interface PortfolioPulseProps {
  posts: PostWithPriceChanges[];
}

export function PortfolioPulse({ posts }: PortfolioPulseProps) {
  const t = useTranslations('dashboard');
  const { colors } = useColorPalette();

  const metrics = useMemo(() => {
    const nonNeutral = posts.filter((p) => p.sentiment !== 0);
    let winCount = 0;
    let totalWithResult = 0;
    const returns: number[] = [];

    for (const post of nonNeutral) {
      for (const stock of post.stocks) {
        const pc = post.priceChanges?.[stock.id];
        if (!pc) continue;
        const change = pc.day30 ?? pc.day5 ?? null;
        if (change === null) continue;
        totalWithResult++;
        const effectiveSentiment = stock.sentiment ?? post.sentiment;
        const isBullish = effectiveSentiment > 0;
        const isBearish = effectiveSentiment < 0;
        const directedReturn = isBullish ? change : isBearish ? -change : 0;
        returns.push(directedReturn);
        if ((isBullish && change > 0) || (isBearish && change < 0)) {
          winCount++;
        }
      }
    }

    const winRate = totalWithResult > 0 ? (winCount / totalWithResult) * 100 : null;
    const avgReturn =
      returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null;

    // Trend direction based on average return
    const trend =
      avgReturn !== null ? (avgReturn > 0.5 ? 'up' : avgReturn < -0.5 ? 'down' : 'flat') : 'flat';

    return { winRate, avgReturn, totalWithResult, trend };
  }, [posts]);

  const TrendIcon =
    metrics.trend === 'up' ? TrendingUp : metrics.trend === 'down' ? TrendingDown : Minus;

  return (
    <Card className="animate-fade-up border-2">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Activity className="text-primary h-4 w-4" />
          {t('pulse.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {metrics.totalWithResult === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">{t('pulse.noData')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {/* Win Rate */}
            <div className="text-center">
              <p className="text-muted-foreground mb-1 text-xs">{t('pulse.winRate')}</p>
              <p
                className={`text-2xl font-bold ${
                  metrics.winRate !== null && metrics.winRate >= 50
                    ? colors.bullish.text
                    : colors.bearish.text
                }`}
              >
                {metrics.winRate !== null ? (
                  <AnimatedNumber value={metrics.winRate} decimals={1} suffix="%" />
                ) : (
                  '—'
                )}
              </p>
            </div>

            {/* Avg Return */}
            <div className="text-center">
              <p className="text-muted-foreground mb-1 text-xs">{t('pulse.avgReturn')}</p>
              <p
                className={`text-2xl font-bold ${
                  metrics.avgReturn !== null && metrics.avgReturn >= 0
                    ? colors.bullish.text
                    : colors.bearish.text
                }`}
              >
                {metrics.avgReturn !== null ? (
                  <AnimatedNumber
                    value={metrics.avgReturn}
                    decimals={1}
                    prefix={metrics.avgReturn >= 0 ? '+' : ''}
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
                    metrics.trend === 'up'
                      ? colors.bullish.text
                      : metrics.trend === 'down'
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
