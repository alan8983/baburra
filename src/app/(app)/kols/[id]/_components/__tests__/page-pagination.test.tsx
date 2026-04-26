import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PagePagination } from '../page-pagination';

vi.mock('next-intl', () => ({
  useTranslations: (_ns: string) => (key: string, params?: Record<string, unknown>) => {
    if (key === 'previous') return 'Previous';
    if (key === 'next') return 'Next';
    if (key === 'pageLabel') return `Page ${params?.page}`;
    return key;
  },
}));

function renderPagination(props: {
  totalPages: number;
  currentPage: number;
  onPageChange?: (p: number) => void;
}) {
  const onPageChange = props.onPageChange ?? vi.fn();
  return {
    onPageChange,
    ...render(
      <PagePagination
        totalPages={props.totalPages}
        currentPage={props.currentPage}
        onPageChange={onPageChange}
      />
    ),
  };
}

describe('PagePagination', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when totalPages <= 1', () => {
    const { container } = renderPagination({ totalPages: 1, currentPage: 1 });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when totalPages is 0', () => {
    const { container } = renderPagination({ totalPages: 0, currentPage: 1 });
    expect(container.firstChild).toBeNull();
  });

  it('shows all page numbers when totalPages is small (3 pages, no ellipsis)', () => {
    renderPagination({ totalPages: 3, currentPage: 1 });
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeInTheDocument();
    expect(screen.queryByText('…')).toBeNull();
  });

  it('renders ellipsis on both sides when current page is in the middle of many', () => {
    renderPagination({ totalPages: 12, currentPage: 6 });
    // First and last pages always visible
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 12' })).toBeInTheDocument();
    // Current ±1 visible
    expect(screen.getByRole('button', { name: 'Page 5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 6' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 7' })).toBeInTheDocument();
    // Page 3 (far gap) should NOT be visible
    expect(screen.queryByRole('button', { name: 'Page 3' })).toBeNull();
    // Two ellipses (one on each side)
    expect(screen.getAllByText('…')).toHaveLength(2);
  });

  it('marks current page as aria-current="page"', () => {
    renderPagination({ totalPages: 5, currentPage: 3 });
    const current = screen.getByRole('button', { name: 'Page 3' });
    expect(current).toHaveAttribute('aria-current', 'page');
    const other = screen.getByRole('button', { name: 'Page 2' });
    expect(other).not.toHaveAttribute('aria-current');
  });

  it('disables Prev on the first page', () => {
    renderPagination({ totalPages: 5, currentPage: 1 });
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
  });

  it('disables Next on the last page', () => {
    renderPagination({ totalPages: 5, currentPage: 5 });
    expect(screen.getByRole('button', { name: 'Previous' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('invokes onPageChange with the clicked page number', () => {
    // currentPage=2 of 5 → visible: 1, 2, 3, …, 5. Click last page (always visible).
    const { onPageChange } = renderPagination({ totalPages: 5, currentPage: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Page 5' }));
    expect(onPageChange).toHaveBeenCalledWith(5);
  });

  it('Prev button moves to currentPage - 1', () => {
    const { onPageChange } = renderPagination({ totalPages: 5, currentPage: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('Next button moves to currentPage + 1', () => {
    const { onPageChange } = renderPagination({ totalPages: 5, currentPage: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });
});
