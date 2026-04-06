import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { InputPageQuickNav } from '../input-page-quick-nav';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock next/link so it renders a plain <a>
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Hooks are mocked per test
const mockUseKols = vi.fn();
const mockUseStocks = vi.fn();

vi.mock('@/hooks/use-kols', () => ({
  useKols: () => mockUseKols(),
}));
vi.mock('@/hooks/use-stocks', () => ({
  useStocks: () => mockUseStocks(),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makeKol(id: string, name: string, createdAt: string) {
  return {
    id,
    name,
    slug: name,
    avatarUrl: null,
    bio: null,
    socialLinks: {},
    validationStatus: 'active',
    validationScore: null,
    validatedAt: null,
    validatedBy: null,
    createdBy: null,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
    postCount: 0,
    returnRate: null,
    lastPostAt: null,
  };
}

function makeStock(id: string, ticker: string, createdAt: string) {
  return {
    id,
    ticker,
    name: ticker,
    logoUrl: null,
    market: 'US' as const,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
    postCount: 0,
    returnRate: null,
    lastPostAt: null,
  };
}

beforeEach(() => {
  mockUseKols.mockReset();
  mockUseStocks.mockReset();
});

describe('InputPageQuickNav', () => {
  it('renders all three nav cards with dashboard link', () => {
    mockUseKols.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false });
    mockUseStocks.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false });

    renderWithClient(<InputPageQuickNav />);

    expect(screen.getByText('dashboard.title')).toBeInTheDocument();
    expect(screen.getByText('kols.title')).toBeInTheDocument();
    expect(screen.getByText('stocks.title')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dashboard\.title/ })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  it('sorts kols by createdAt desc and takes top 3', () => {
    const kols = [
      makeKol('1', 'Alice', '2026-01-01'),
      makeKol('2', 'Bob', '2026-03-01'),
      makeKol('3', 'Carol', '2026-02-01'),
      makeKol('4', 'Dave', '2026-04-01'),
    ];
    mockUseKols.mockReturnValue({ data: { data: kols, total: 4 }, isLoading: false });
    mockUseStocks.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false });

    renderWithClient(<InputPageQuickNav />);

    expect(screen.getByText('Dave')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();

    // Chip links to /kols/[id]
    expect(screen.getByText('Dave').closest('a')).toHaveAttribute('href', '/kols/4');
  });

  it('sorts stocks by createdAt desc and chips link to /stocks/[ticker]', () => {
    const stocks = [
      makeStock('s1', 'AAPL', '2026-02-01'),
      makeStock('s2', 'TSLA', '2026-04-01'),
      makeStock('s3', 'NVDA', '2026-03-01'),
    ];
    mockUseKols.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false });
    mockUseStocks.mockReturnValue({ data: { data: stocks, total: 3 }, isLoading: false });

    renderWithClient(<InputPageQuickNav />);

    expect(screen.getByText('TSLA').closest('a')).toHaveAttribute('href', '/stocks/TSLA');
    expect(screen.getByText('NVDA').closest('a')).toHaveAttribute('href', '/stocks/NVDA');
    expect(screen.getByText('AAPL').closest('a')).toHaveAttribute('href', '/stocks/AAPL');
  });

  it('renders empty-state copy when lists are empty', () => {
    mockUseKols.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false });
    mockUseStocks.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false });

    renderWithClient(<InputPageQuickNav />);

    expect(screen.getByText('kols.empty')).toBeInTheDocument();
    expect(screen.getByText('stocks.empty')).toBeInTheDocument();
  });

  it('renders skeletons while loading', () => {
    mockUseKols.mockReturnValue({ data: undefined, isLoading: true });
    mockUseStocks.mockReturnValue({ data: undefined, isLoading: true });

    renderWithClient(<InputPageQuickNav />);

    expect(screen.getAllByTestId('quick-nav-skeleton')).toHaveLength(2);
  });
});
