'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ROUTES } from '@/lib/constants';
import { type Sentiment } from '@/domain/models/post';
import {
  useKol,
  useKolPosts,
  useKolSources,
  useActiveScrapeForKol,
  useReanalyzeBatch,
  useKolFollowerCount,
} from '@/hooks';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KolScorecard } from './_components/kol-scorecard';
import { KolStockSection, type StockGroup } from './_components/kol-stock-section';
import { PagePagination } from './_components/page-pagination';

const STOCKS_PER_PAGE = 10;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations('kols');
  const tPosts = useTranslations('posts');
  const { id } = use(params);
  const { data: kol, isLoading: kolLoading, error: kolError } = useKol(id);
  // Per R13: the detail page must request the full post set so per-stock
  // breakdowns, sentiment markers, and post lists reflect the same universe
  // as `computeKolScorecard` (which also uses limit=1000). Default limit=20
  // remains for `usePosts` and other paginated callers.
  const { data: postsData, isLoading: postsLoading } = useKolPosts(id, { limit: 1000 });
  const { data: kolSources } = useKolSources(id);
  const activeScrape = useActiveScrapeForKol(id);
  const reanalyzeBatch = useReanalyzeBatch();
  const { data: followerData } = useKolFollowerCount(id);

  // Group posts by stock, capturing all price-change periods
  const postsByStock = useMemo<StockGroup[]>(() => {
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
    return Array.from(map.values()).sort((a, b) => {
      if (b.posts.length !== a.posts.length) return b.posts.length - a.posts.length;
      return a.ticker.localeCompare(b.ticker);
    });
  }, [postsData?.data]);

  // Pagination state — reset to page 1 whenever the KOL id changes.
  // React's recommended "reset state during render" pattern (avoids useEffect setState).
  const [currentPage, setCurrentPage] = useState(1);
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(postsByStock.length / STOCKS_PER_PAGE));
  const visibleStocks = useMemo(
    () => postsByStock.slice((currentPage - 1) * STOCKS_PER_PAGE, currentPage * STOCKS_PER_PAGE),
    [postsByStock, currentPage]
  );

  // Flatten all stock-level posts for the scorecard
  const allStockPosts = useMemo(() => {
    return postsByStock.flatMap((stock) =>
      stock.posts.map((p) => ({
        id: p.id,
        stockId: stock.stockId,
        stockTicker: stock.ticker,
        stockName: stock.name,
        sentiment: p.sentiment,
        priceChanges: p.priceChanges,
      }))
    );
  }, [postsByStock]);

  const hasInferredTickers = useMemo(() => {
    const list = postsData?.data ?? [];
    return list.some((post) => post.stocks.some((s) => s.source === 'inferred'));
  }, [postsData?.data]);

  const stalePosts = useMemo(() => {
    const currentModel = postsData?.currentAiModel;
    if (!currentModel || !postsData?.data) return [];
    return postsData.data.filter(
      (p) => p.aiModelVersion == null || p.aiModelVersion !== currentModel
    );
  }, [postsData]);

  if (kolError || (!kolLoading && !kol)) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.KOLS}>{t('detail.backToList')}</Link>
        </Button>
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-destructive">{t('detail.errors.loadFailed')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (kolLoading || !kol) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.KOLS}>{t('detail.backToList')}</Link>
        </Button>
        <p className="text-muted-foreground">{t('detail.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href={ROUTES.KOLS}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('detail.backToList')}
        </Link>
      </Button>

      {/* KOL Scorecard */}
      <KolScorecard
        kol={kol}
        followerCount={followerData?.followerCount}
        sources={kolSources}
        kolId={id}
        stockPosts={allStockPosts}
        hasInferredTickers={hasInferredTickers}
      />

      {/* Scrape in-progress banner */}
      {activeScrape && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            {t('detail.scrapeInProgress', {
              processed: activeScrape.processedUrls ?? 0,
              total: activeScrape.totalUrls ?? 0,
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* Batch re-analyze banner */}
      {stalePosts.length > 0 && (
        <Alert>
          <RefreshCw className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{tPosts('detail.reanalyze.bannerLegacy')}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={reanalyzeBatch.isPending}
              onClick={() => {
                const ids = stalePosts.slice(0, 10).map((p) => p.id);
                reanalyzeBatch.mutate(ids, {
                  onSuccess: (result) => {
                    toast.success(
                      tPosts('detail.reanalyze.batchProgress', {
                        done: result.success,
                        total: ids.length,
                      })
                    );
                  },
                  onError: () => toast.error(tPosts('detail.reanalyze.failed')),
                });
              }}
            >
              {reanalyzeBatch.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {tPosts('detail.reanalyze.batchButton', { count: stalePosts.length })}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Per-stock sections */}
      {postsLoading ? (
        <p className="text-muted-foreground">{t('detail.postsByStock.loading')}</p>
      ) : postsByStock.length === 0 ? (
        <p className="text-muted-foreground">{t('detail.postsByStock.noPosts')}</p>
      ) : (
        <>
          <div className="space-y-2">
            {visibleStocks.map((stock, i) => (
              <div key={stock.stockId}>
                {i > 0 && <Separator className="my-5" />}
                <KolStockSection stock={stock} kolId={id} />
              </div>
            ))}
          </div>
          <PagePagination
            totalPages={totalPages}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
}
