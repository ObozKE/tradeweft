import React from 'react';
import type { AgreementStatus } from '../types/agreement.types';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowLeftRight,
  ShieldAlert,
  Ban,
} from 'lucide-react';

interface AgreementStatusBadgeProps {
  status: AgreementStatus;
  className?: string;
}

export function AgreementStatusBadge({ status, className = '' }: AgreementStatusBadgeProps) {
  switch (status) {
    case 'proposed':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-text-secondary border border-border ${className}`}
        >
          <Clock className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          Proposed (In Negotiation)
        </span>
      );

    case 'active':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip bg-pine-100 px-2.5 py-0.5 text-xs font-semibold text-pine-800 border border-pine-200 ${className}`}
        >
          <ArrowLeftRight className="h-3.5 w-3.5 text-pine-700" aria-hidden="true" />
          Active (Trade in Progress)
        </span>
      );

    case 'completed':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip bg-pine-100 px-2.5 py-0.5 text-xs font-semibold text-pine-800 border border-pine-300 ${className}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-pine-700" aria-hidden="true" />
          Completed
        </span>
      );

    case 'declined':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-text-muted border border-border ${className}`}
        >
          <XCircle className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          Declined
        </span>
      );

    case 'withdrawn':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-text-muted border border-border ${className}`}
        >
          <Ban className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          Withdrawn
        </span>
      );

    case 'expired':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200 ${className}`}
        >
          <Clock className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
          Expired
        </span>
      );

    case 'cancelled':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200 ${className}`}
        >
          <AlertCircle className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
          Cancelled (Mutual)
        </span>
      );

    case 'disputed':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 border border-amber-300 ${className}`}
        >
          <ShieldAlert className="h-3.5 w-3.5 text-amber-800" aria-hidden="true" />
          Disputed (Resolution Pending)
        </span>
      );

    default:
      return null;
  }
}
