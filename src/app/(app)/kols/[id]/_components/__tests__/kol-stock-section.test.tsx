import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { KolStockSection, type StockGroup } from '../kol-stock-section';
import { ROUTES } from '@/lib/constants';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, unknown>) => {
    if (key === 'detail.postsByStock.showMore') return `View all ${params?.count} posts`;
    if (key === 'detail.postsByStock.total') return `Total ${params?.count} posts`;
    if (key === 'detail.postsByStock.title') return 'Posts by Stock';
    if (key === 'detail.sentimentChart.title') return 'Sentiment Chart';
    if (key === 'detail.returnRate.title') return 'Return Rate';
    if (key === 'detail.returnRate.explanation.title') return 'Explanation';
    if (key === 'detail.returnRate.explanation.bullish') return 'Bullish';
    if (key === 'detail.returnRate.explanation.bearish') return 'Bearish';
    if (key === 'detail.returnRate.explanation.neutral') return 'Neutral';
    if (key === 'detail.returnRate.explanation.perStock') return 'Per stock';
    if (key === 'detail.returnRate.pending') return 'Pending';
    if (key === 'detail.errors.noPriceData') return 'No price data';
    if (key.startsWith('detail.returnRate.periods.')) return key.split('.').pop() ?? key;
    if (key.startsWith('sentiment.')) return key.replace('sentiment.', '');
    void ns;
    return key;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/dynamic', () => ({
  default: (_importFn: unknown) => {
    // Return a placeholder component that renders nothing — chart rendering
    // is irrelevant to the post-list slice tests.
    return function DynamicPlaceholder() {
      return null;
    };
  },
}));

vi.mock('@/lib/colors/color-palette-context', () => ({
  useColorPalette: () => ({
    palette: 'default',
    colors: {
      sentimentBadgeColors: {
        1: 'text-green-500',
        0: 'text-gray-400',
        '-1': 'text-red-500',
      },
    },
  }),
}));

vi.mock('@/hooks/use-unlocks', () => ({
  useUnlockChecks: () => ({
    hasLayer2: () => true, // bypass L2 gate — not under test here
  }),
}));

vi.mock('@/hooks/use-stock-prices', () => ({
  useStockPricesForChart: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/hooks', () => ({
  useKolWinRate: () => ({ data: null }),
}));

vi.mock('@/components/shared/price-change-badge', () => ({
  PriceChangeBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock('@/components/paywall/unlock-cta', () => ({
  UnlockCta: () => <div data-testid="unlock-cta" />,
}));

// ─── Factory ──────────────────────────────────────────────────────────────────

function makePost(id: string): StockGroup['posts'][number] {
  // Use a fixed valid date for all posts — ordering tests don't depend on dates.
  return {
    id,
    content: `Content of post ${id}`,
    sentiment: 1,
    postedAt: new Date('2024-01-15'),
    priceChanges: {
      day5: null,
      day30: null,
      day90: null,
      day365: null,
      day5Status: 'no_data',
      day30Status: 'no_data',
      day90Status: 'no_data',
      day365Status: 'no_data',
    },
  };
}

function makeStock(ticker: string, postCount: number): StockGroup {
  return {
    stockId: 'stock-1',
    ticker,
    name: `${ticker} Corp`,
    posts: Array.from({ length: postCount }, (_, i) => makePost(String(i + 1))),
  };
}

const TEST_KOL_ID = 'kol-abc-123';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderSection(stock: StockGroup, showAllPosts?: boolean) {
  return render(<KolStockSection stock={stock} kolId={TEST_KOL_ID} showAllPosts={showAllPosts} />);
}

function getRenderedPosts(container: HTMLElement): HTMLElement[] {
  // Each post renders as a div with the post content. The content text is
  // "Content of post N" — look for elements that contain it.
  return Array.from(container.querySelectorAll<HTMLElement>('[class*="cursor-pointer"]'));
}

function getShowMoreLink(container: HTMLElement): HTMLElement | null {
  // The "Show more" button is a Link that navigates to /kols/.../stocks/...
  // (distinct from the stock-detail link which is /stocks/... only).
  return container.querySelector<HTMLElement>('a[href*="/kols/"]') ?? null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('KolStockSection — post slice behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders all 3 posts and NO "Show more" button when stock.posts.length === 3', () => {
    const stock = makeStock('NVDA', 3);
    const { container } = renderSection(stock);
    expect(getRenderedPosts(container)).toHaveLength(3);
    expect(screen.queryByText(/View all \d+ posts/)).toBeNull();
  });

  it('renders all 1 post and no button when stock.posts.length === 1', () => {
    const stock = makeStock('NVDA', 1);
    const { container } = renderSection(stock);
    expect(getRenderedPosts(container)).toHaveLength(1);
    expect(screen.queryByText(/View all \d+ posts/)).toBeNull();
  });

  it('renders all 2 posts and no button when stock.posts.length === 2', () => {
    const stock = makeStock('NVDA', 2);
    const { container } = renderSection(stock);
    expect(getRenderedPosts(container)).toHaveLength(2);
    expect(screen.queryByText(/View all \d+ posts/)).toBeNull();
  });

  it('renders exactly 3 posts + "Show more" button when stock.posts.length === 4', () => {
    const stock = makeStock('NVDA', 4);
    const { container } = renderSection(stock);
    expect(getRenderedPosts(container)).toHaveLength(3);
    expect(screen.getByText('View all 4 posts')).toBeInTheDocument();
  });

  it('renders exactly 3 posts + button when stock.posts.length === 40', () => {
    const stock = makeStock('NVDA', 40);
    const { container } = renderSection(stock);
    expect(getRenderedPosts(container)).toHaveLength(3);
    expect(screen.getByText('View all 40 posts')).toBeInTheDocument();
  });

  it('renders ALL 40 posts and NO button when showAllPosts === true', () => {
    const stock = makeStock('NVDA', 40);
    const { container } = renderSection(stock, true);
    expect(getRenderedPosts(container)).toHaveLength(40);
    expect(screen.queryByText(/View all \d+ posts/)).toBeNull();
  });

  it('preserves input order — first 3 rendered posts match posts[0..2]', () => {
    const stock = makeStock('NVDA', 10);
    const { container } = renderSection(stock);
    const postEls = getRenderedPosts(container);
    expect(postEls).toHaveLength(3);
    // Each rendered post contains "Content of post N" where N = index + 1.
    expect(postEls[0].textContent).toContain('Content of post 1');
    expect(postEls[1].textContent).toContain('Content of post 2');
    expect(postEls[2].textContent).toContain('Content of post 3');
  });

  describe('button href encoding', () => {
    it('URL-encodes BRK.B correctly in the "Show more" link href', () => {
      const stock = makeStock('BRK.B', 4);
      const { container } = renderSection(stock);
      const link = getShowMoreLink(container);
      expect(link).not.toBeNull();
      const expectedHref = ROUTES.KOL_STOCK_DETAIL(TEST_KOL_ID, 'BRK.B');
      expect(link?.getAttribute('href')).toBe(expectedHref);
      // BRK.B should be encoded — the dot doesn't require encoding per RFC 3986
      // but encodeURIComponent leaves it as-is; assert the path contains it.
      expect(link?.getAttribute('href')).toContain('BRK.B');
    });

    it('URL-encodes ^TWII correctly in the "Show more" link href', () => {
      const stock = makeStock('^TWII', 4);
      const { container } = renderSection(stock);
      const link = getShowMoreLink(container);
      expect(link).not.toBeNull();
      const expectedHref = ROUTES.KOL_STOCK_DETAIL(TEST_KOL_ID, '^TWII');
      expect(link?.getAttribute('href')).toBe(expectedHref);
      // ^ must be encoded as %5E
      expect(link?.getAttribute('href')).toContain('%5ETWII');
    });
  });
});
