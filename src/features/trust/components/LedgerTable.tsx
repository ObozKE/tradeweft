'use client';

import React, { useState, useTransition } from 'react';
import { ShieldCheck, FileCheck, ExternalLink, ArrowDown } from 'lucide-react';
import type { LedgerEntryItem } from '../types/trust.types';
import { formatContractRef } from '../utils/reputation';

interface LedgerTableProps {
  initialEntries: LedgerEntryItem[];
  initialCursor?: { completedAt: string; id: string } | null;
  providerId: string;
  className?: string;
}

export function LedgerTable({
  initialEntries,
  initialCursor,
  providerId,
  className = '',
}: LedgerTableProps) {
  const [entries, setEntries] = useState<LedgerEntryItem[]>(initialEntries);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();

  const handleLoadMore = () => {
    if (!cursor) return;
    startTransition(async () => {
      // Fetch next page via API/server action
      try {
        const params = new URLSearchParams({
          providerId,
          cursorCompletedAt: cursor.completedAt,
          cursorId: cursor.id,
        });
        const res = await fetch(`/api/trust/ledger?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          setEntries((prev) => [...prev, ...json.entries]);
          setCursor(json.nextCursor);
        }
      } catch {
        // silent fail for pagination
      }
    });
  };

  if (entries.length === 0) {
    return (
      <div className={`rounded-xl border border-border bg-surface p-8 text-center text-text-muted ${className}`}>
        <FileCheck className="h-8 w-8 text-text-muted mx-auto mb-2" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-ink">Public Ledger Empty</h3>
        <p className="text-xs text-text-secondary mt-1">
          Completed trades agreed under terms with public ledger consent will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-border bg-surface shadow-sm overflow-hidden ${className}`}>
      <div className="p-4 border-b border-border bg-surface-sunken flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-pine-600" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-ink">Public Trust Ledger</h3>
        </div>
        <span className="text-xs text-text-secondary">
          Tamper-evident SHA-256 contract hashes recorded on contract acceptance.
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-sunken text-text-secondary border-b border-border">
            <tr>
              <th className="py-3 px-4 font-semibold">Date Completed</th>
              <th className="py-3 px-4 font-semibold">Trading Partner</th>
              <th className="py-3 px-4 font-semibold">Contract Ref</th>
              <th className="py-3 px-4 font-semibold">Country</th>
              <th className="py-3 px-4 font-semibold">Terms Version</th>
              <th className="py-3 px-4 font-semibold text-right">Integrity Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-surface-sunken/50 transition-colors">
                <td className="py-3 px-4 font-medium text-ink whitespace-nowrap">
                  {new Date(entry.completedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
                <td className="py-3 px-4 text-ink">
                  <div>
                    <span className="font-semibold">{entry.counterpartyName}</span>
                    {entry.counterpartyBusinessName && (
                      <span className="text-[11px] text-text-secondary ms-1">
                        ({entry.counterpartyBusinessName})
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-pine-700">
                  <span
                    className="bg-pine-50 px-2 py-0.5 rounded-sm border border-pine-200"
                    title={`Full Terms SHA-256 Hash: ${entry.termsHash}`}
                  >
                    {formatContractRef(entry.termsHash)}
                  </span>
                </td>
                <td className="py-3 px-4 text-text-secondary font-medium uppercase">
                  {entry.countryCode}
                </td>
                <td className="py-3 px-4 text-text-muted">
                  {entry.tradeTermsVersion}
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="inline-flex items-center gap-1 rounded-chip bg-pine-50 px-2 py-0.5 text-[11px] font-medium text-pine-800 border border-pine-200">
                    <ShieldCheck className="h-3 w-3 text-pine-600" aria-hidden="true" />
                    Verified
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cursor && (
        <div className="p-3 border-t border-border bg-surface text-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-border bg-surface-sunken hover:bg-surface text-xs font-semibold text-ink transition-colors disabled:opacity-50"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            {isPending ? 'Loading...' : 'Load Earlier Ledger Entries'}
          </button>
        </div>
      )}
    </div>
  );
}
