import React from 'react';
import { CheckCircle2, FileEdit, PauseCircle, Archive, Ban } from 'lucide-react';
import type { PackageStatus } from '../schemas/package.schema';

interface PackageStatusBadgeProps {
  status: PackageStatus;
  className?: string;
}

export function PackageStatusBadge({ status, className = '' }: PackageStatusBadgeProps) {
  switch (status) {
    case 'published':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip border border-pine-300 bg-pine-100 px-2.5 py-0.5 text-xs font-medium uppercase tracking-[0.04em] text-pine-800 ${className}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-pine-700" aria-hidden="true" />
          <span>Published</span>
        </span>
      );

    case 'draft':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface-sunken px-2.5 py-0.5 text-xs font-medium uppercase tracking-[0.04em] text-ink ${className}`}
        >
          <FileEdit className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
          <span>Draft</span>
        </span>
      );

    case 'paused':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-medium uppercase tracking-[0.04em] text-amber-800 ${className}`}
        >
          <PauseCircle className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
          <span>Paused</span>
        </span>
      );

    case 'archived':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface-sunken/60 px-2.5 py-0.5 text-xs font-medium uppercase tracking-[0.04em] text-text-muted ${className}`}
        >
          <Archive className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          <span>Archived</span>
        </span>
      );

    case 'removed':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface-sunken px-2.5 py-0.5 text-xs font-medium uppercase tracking-[0.04em] text-text-muted ${className}`}
        >
          <Ban className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          <span>Removed</span>
        </span>
      );

    default:
      return null;
  }
}
