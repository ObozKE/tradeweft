import React from 'react';
import { calculateTradeBalance, type ValuedLine } from '../utils/balance';
import { Scale, AlertCircle, CheckCircle2 } from 'lucide-react';

interface BalanceMeterProps {
  myLines: ValuedLine[];
  theirLines: ValuedLine[];
  currencyCode?: string;
  className?: string;
}

export function BalanceMeter({
  myLines,
  theirLines,
  currencyCode = 'KES',
  className = '',
}: BalanceMeterProps) {
  const balance = calculateTradeBalance(myLines, theirLines, currencyCode);

  let badgeBg = 'bg-pine-100 text-pine-800 border-pine-200';
  let Icon = CheckCircle2;

  if (balance.status === 'incomplete') {
    badgeBg = 'bg-amber-50 text-amber-800 border-amber-200';
    Icon = AlertCircle;
  } else if (balance.status === 'tilted_toward_them' || balance.status === 'tilted_toward_you') {
    badgeBg = 'bg-surface-sunken text-text-secondary border-border';
    Icon = Scale;
  }

  return (
    <div className={`rounded-card border border-border bg-white p-4 space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-pine-700" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-ink">Advisory Value Balance</h4>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-chip px-2.5 py-0.5 text-xs font-semibold border ${badgeBg}`}
        >
          <Icon className="h-3 w-3" aria-hidden="true" />
          {balance.label}
        </span>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-2 gap-3 pt-1 text-center">
        <div className="rounded-button bg-surface-sunken p-2.5">
          <p className="text-xs text-text-muted">You Give (Total)</p>
          <p className="text-sm font-bold text-ink mt-0.5">{balance.formattedMyTotal}</p>
        </div>
        <div className="rounded-button bg-surface-sunken p-2.5">
          <p className="text-xs text-text-muted">You Receive (Total)</p>
          <p className="text-sm font-bold text-ink mt-0.5">{balance.formattedTheirTotal}</p>
        </div>
      </div>

      <p className="text-[11px] text-text-muted text-center italic">
        Advisory estimate only. Barter agreements are determined by mutual agreement, not cash prices.
      </p>
    </div>
  );
}
