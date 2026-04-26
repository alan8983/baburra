import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { KolStockSection, type StockGroup } from '../kol-stock-section';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, unknown>) => {
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
    // Chart rendering is mocked out — the layout tests don't depend on the
    // actual canvas, only that a chart-shaped element is reachable.
    return function DynamicPlaceholder() {
      return <div data-testid="sentiment-chart" />;
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
  useStockPricesForChart: () => ({
    data: { candles: [{ time: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5 }] },
    isLoading: false,
  }),
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('KolStockSection — thin layout (KOL detail list view)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders ticker link, stock name, and count badge', () => {
    const stock = makeStock('NVDA', 18);
    renderSection(stock);
    // Ticker link to stock detail
    const tickerLink = screen.getByRole('link', { name: 'NVDA' });
    expect(tickerLink).toBeInTheDocument();
    // Count badge
    expect(screen.getByText('Total 18 posts')).toBeInTheDocument();
    // Stock name
    expect(screen.getByText('NVDA Corp')).toBeInTheDocument();
  });

  it('renders the sentiment chart placeholder', () => {
    const stock = makeStock('NVDA', 5);
    renderSection(stock);
    expect(screen.getByTestId('sentiment-chart')).toBeInTheDocument();
  });

  it('renders all 4 period labels (5d / 30d / 90d / 365d) in the stats strip', () => {
    const stock = makeStock('NVDA', 5);
    renderSection(stock);
    // Period labels come from the i18n mock (returns last segment).
    expect(screen.getAllByText('5d').length).toBeGreaterThan(0);
    expect(screen.getAllByText('30d').length).toBeGreaterThan(0);
    expect(screen.getAllByText('90d').length).toBeGreaterThan(0);
    expect(screen.getAllByText('365d').length).toBeGreaterThan(0);
  });

  it('does NOT render any per-post snippet in the thin layout', () => {
    const stock = makeStock('NVDA', 18);
    renderSection(stock);
    // Post-snippet elements would contain "Content of post N".
    expect(screen.queryByText(/Content of post/)).toBeNull();
  });

  it('does NOT render a "Show more" link in the thin layout', () => {
    const stock = makeStock('NVDA', 40);
    const { container } = renderSection(stock);
    // The drill-down link href pattern from the old layout is gone.
    expect(container.querySelector('a[href*="/kols/"][href*="/stocks/"]')).toBeNull();
  });
});

describe('KolStockSection — full layout (showAllPosts === true)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders ALL posts when showAllPosts is true', () => {
    const stock = makeStock('NVDA', 12);
    renderSection(stock, true);
    // Each post renders its content text in a card.
    const postEls = screen.getAllByText(/Content of post/);
    expect(postEls).toHaveLength(12);
  });

  it('renders the 2-column "Posts by Stock" card in the full layout', () => {
    const stock = makeStock('NVDA', 3);
    renderSection(stock, true);
    expect(screen.getByText('Posts by Stock')).toBeInTheDocument();
  });
});
