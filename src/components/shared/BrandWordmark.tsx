import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface BrandWordmarkProps {
  className?: string;
  theme?: 'light' | 'dark';
  href?: string;
}

export function BrandWordmark({
  className,
  theme = 'light',
  href = '/',
}: BrandWordmarkProps) {
  const content = (
    <div className={cn('inline-flex items-center gap-2 select-none', className)}>
      {/* Weft warp crossing SVG motif */}
      <svg
        className="h-6 w-6 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M4 12H20M12 4V20M7 8L17 16M7 16L17 8"
          stroke="#01796F"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={cn(
          'text-xl font-semibold tracking-[-0.02em]',
          theme === 'dark' ? 'text-white' : 'text-ink'
        )}
      >
        Trade Weft
      </span>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine-500 rounded-sm"
      >
        {content}
      </Link>
    );
  }

  return content;
}
