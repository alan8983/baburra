'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowUpDown, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { getStaggerClass } from '@/lib/animations';
import type { PostWithPriceChanges } from '@/domain/models';

interface StockMoversProps {
  posts: PostWithPriceChanges[];
}

interface StockMover {
  ticker: string;
  name: string;
  priceChange: number;
  kolCount: number;
}

export function StockMovers({ posts }: StockMoversProps) {
  const t = useTranslations('dashboard');
  const { colors } = useColorPalette();

  const movers = useMemo(() => {
    const stockMap = new Map<
      string,
      { ticker: string; name: string; changes: number[]; kols: Set<string> }
    >();

    for (const post of posts) {
      for (const stock of post.stocks) {
        const pc = post.priceChanges?.[stock.id];
        if (!pc) continue;
        const change = pc.day5 ?? pc.day30 ?? null;
        if (change === null) continue;

        if (!stockMap.has(stock.ticker)) {
          stockMap.set(stock.ticker, {
            ticker: stock.ticker,
            name: stock.name,
            changes: [],
            kols: new Set(),
          });
        }
        const entry = stockMap.get(stock.ticker)!;
        entry.changes.push(change);
        entry.kols.add(post.kol.id);
      }
    }

    const result: StockMover[] = [];
    for (const [, entry] of stockMap) {
      const avgChange = entry.changes.reduce((a, b) => a + b, 0) / entry.changes.length;
      result.push({
        ticker: entry.ticker,
        name: entry.name,
        priceChange: avgChange,
        kolCount: entry.kols.size,
      });
    }

    return result.sort((a, b) => Math.abs(b.priceChange) - Math.abs(a.priceChange)).slice(0, 5);
  }, [posts]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ArrowUpDown className="text-primary h-4 w-4" />
          {t('movers.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {movers.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">{t('movers.noData')}</p>
        ) : (
          <div className="space-y-1">
            {movers.map((stock, i) => (
              <Link
                key={stock.ticker}
                href={ROUTES.STOCK_DETAIL(stock.ticker)}
                className={`hover:bg-muted flex items-center justify-between rounded-lg px-2 py-2.5 transition-colors ${getStaggerClass(i)}`}
              >
                <div>
                  <span className="text-sm font-bold">{stock.ticker}</span>
                  <p className="text-muted-foreground text-xs">{stock.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Users className="h-3 w-3" />
                    {stock.kolCount}
                  </Badge>
                  <span
                    className={`min-w-[60px] text-right text-sm font-bold ${
                      stock.priceChange >= 0 ? colors.bullish.text : colors.bearish.text
                    }`}
                  >
                    {stock.priceChange >= 0 ? '+' : ''}
                    {stock.priceChange.toFixed(1)}%
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
