'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants';
import { type Sentiment } from '@/domain/models/post';
import { useKol, useKolPosts } from '@/hooks';
import { KolStockSection, type StockGroup } from '../../_components/kol-stock-section';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KolStockDetailPage({
  params,
}: {
  params: Promise<{ id: string; ticker: string }>;
}) {
  const t = useTranslations('kols');
  const { id, ticker } = use(params);
  const decodedTicker = decodeURIComponent(ticker);

  const { data: kol, isLoading: kolLoading, error: kolError } = useKol(id);
  const { data: postsData, isLoading: postsLoading } = useKolPosts(id);

  // Re-run the same postsByStock group-by from the KOL detail page,
  // then pick the single StockGroup matching this ticker.
  const stockGroup = useMemo<StockGroup | null>(() => {
    const list = postsData?.data ?? [];
    const map = new Map<string, StockGroup>();
    for (const post of list) {
      const priceChanges = post.priceChanges ?? {};
      for (const stock of post.stocks) {
        if (!map.has(stock.id)) {
          map.set(stock.id, {
            stockId: stock.id,
            ticker: stock.ticker,
            name: stock.name,
            posts: [],
          });
        }
        const pc = priceChanges[stock.id];
        map.get(stock.id)!.posts.push({
          id: post.id,
          content: post.content,
          sentiment: (stock.sentiment ?? post.sentiment) as Sentiment,
          postedAt: post.postedAt,
          priceChanges: {
            day5: pc?.day5 ?? null,
            day30: pc?.day30 ?? null,
            day90: pc?.day90 ?? null,
            day365: pc?.day365 ?? null,
            day5Status: pc?.day5Status ?? 'no_data',
            day30Status: pc?.day30Status ?? 'no_data',
            day90Status: pc?.day90Status ?? 'no_data',
            day365Status: pc?.day365Status ?? 'no_data',
          },
        });
      }
    }
    return (
      Array.from(map.values()).find(
        (g) => g.ticker.toUpperCase() === decodedTicker.toUpperCase()
      ) ?? null
    );
  }, [postsData?.data, decodedTicker]);

  // ── Loading / error states ──────────────────────────────────────────────────

  if (kolError || (!kolLoading && !kol)) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.KOLS}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('detail.backToList')}
          </Link>
        </Button>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">{t('detail.errors.loadFailed')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (kolLoading || postsLoading || !kol) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.KOLS}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('detail.backToList')}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          <p className="text-muted-foreground">{t('detail.loading')}</p>
        </div>
      </div>
    );
  }

  const backHref = ROUTES.KOL_DETAIL(id);

  // ── Empty state: KOL exists but no posts for this ticker ───────────────────

  if (!stockGroup) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('detail.postsByStock.backToKol', { name: kol.name })}
          </Link>
        </Button>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-muted-foreground">
              {t('detail.postsByStock.empty', {
                kolName: kol.name,
                ticker: decodedTicker,
              })}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Full page ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Button variant="ghost" size="sm" asChild>
        <Link href={backHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('detail.postsByStock.backToKol', { name: kol.name })}
        </Link>
      </Button>

      {/* Stock section with all posts */}
      <KolStockSection stock={stockGroup} kolId={id} showAllPosts />
    </div>
  );
}
