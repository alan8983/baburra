'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PagePaginationProps {
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

function buildPageWindow(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 1) return [];
  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: Array<number | 'ellipsis'> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('ellipsis');
    out.push(sorted[i]);
  }
  return out;
}

export function PagePagination({ totalPages, currentPage, onPageChange }: PagePaginationProps) {
  const t = useTranslations('kols.detail.pagination');

  if (totalPages <= 1) return null;

  const window = buildPageWindow(currentPage, totalPages);
  const prevDisabled = currentPage === 1;
  const nextDisabled = currentPage === totalPages;

  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('previous')}
        disabled={prevDisabled}
        onClick={() => onPageChange(currentPage - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {window.map((item, i) =>
        item === 'ellipsis' ? (
          <span
            key={`ellipsis-${i}`}
            className="text-muted-foreground px-2 text-sm select-none"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === currentPage ? 'outline' : 'ghost'}
            size="icon"
            aria-label={t('pageLabel', { page: item })}
            aria-current={item === currentPage ? 'page' : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        )
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('next')}
        disabled={nextDisabled}
        onClick={() => onPageChange(currentPage + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}
