'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  totalItems: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  totalItems,
  pageSize,
  currentPage,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);

  if (totalPages <= 1) return null;

  const pages: (number | 'ellipsis')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }

  return (
    <nav className="flex items-center justify-center gap-1 mt-6" aria-label="페이지 네비게이션">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="이전 페이지"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pages.map((page, i) =>
        page === 'ellipsis' ? (
          <span key={`e-${i}`} className="px-2 text-gray-400">
            …
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`
              min-w-[36px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
              ${
                page === currentPage
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }
            `}
          >
            {page}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="다음 페이지"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
