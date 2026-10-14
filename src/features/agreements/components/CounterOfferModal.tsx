'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BalanceMeter } from './BalanceMeter';
import { counterTradeAction } from '../actions/agreement.actions';
import { formatIndicativeValue } from '@/features/packages/utils/currency';
import type { AgreementLineItem, PublishedPackageForTrade } from '../types/agreement.types';
import {
  ArrowLeftRight,
  Plus,
  Trash2,
  AlertCircle,
  X,
  RotateCcw,
} from 'lucide-react';

interface CounterLineState {
  packageVersionId: string;
  quantity: number;
  title: string;
  indicativeValueMinor: number | null;
  currencyCode: string;
}

interface CounterOfferModalProps {
  agreementId: string;
  expectedRevisionNo: number;
  isOpen: boolean;
  onClose: () => void;
  myRole: 'proposer' | 'recipient';
  counterpartyName: string;
  currentLines: AgreementLineItem[];
  myPackages: PublishedPackageForTrade[];
  counterpartyPackages: PublishedPackageForTrade[];
}

export function CounterOfferModal({
  agreementId,
  expectedRevisionNo,
  isOpen,
  onClose,
  myRole,
  counterpartyName,
  currentLines,
  myPackages,
  counterpartyPackages,
}: CounterOfferModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Partition current lines by side (proposer_gives vs recipient_gives)
  const initialProposerLines: CounterLineState[] = currentLines
    .filter((l) => l.side === 'proposer_gives')
    .map((l) => ({
      packageVersionId: l.packageVersionId,
      quantity: l.quantity,
      title: l.title,
      indicativeValueMinor: l.indicativeValueMinor,
      currencyCode: l.currencyCode,
    }));

  const initialRecipientLines: CounterLineState[] = currentLines
    .filter((l) => l.side === 'recipient_gives')
    .map((l) => ({
      packageVersionId: l.packageVersionId,
      quantity: l.quantity,
      title: l.title,
      indicativeValueMinor: l.indicativeValueMinor,
      currencyCode: l.currencyCode,
    }));

  const [proposerLines, setProposerLines] = useState<CounterLineState[]>(initialProposerLines);
  const [recipientLines, setRecipientLines] = useState<CounterLineState[]>(initialRecipientLines);

  if (!isOpen) return null;

  // Map to "I Give" and "They Give" based on role
  const iAmProposer = myRole === 'proposer';
  const myGivesLines = iAmProposer ? proposerLines : recipientLines;
  const setMyGivesLines = iAmProposer ? setProposerLines : setRecipientLines;
  const theirGivesLines = iAmProposer ? recipientLines : proposerLines;
  const setTheirGivesLines = iAmProposer ? setRecipientLines : setProposerLines;

  const handleUpdateQuantity = (
    side: 'mine' | 'theirs',
    index: number,
    delta: number
  ) => {
    const list = side === 'mine' ? [...myGivesLines] : [...theirGivesLines];
    const target = list[index];
    if (!target) return;
    const nextQty = Math.max(1, Math.min(99, target.quantity + delta));
    list[index] = { ...target, quantity: nextQty };
    if (side === 'mine') {
      setMyGivesLines(list);
    } else {
      setTheirGivesLines(list);
    }
  };

  const handleRemoveLine = (side: 'mine' | 'theirs', index: number) => {
    if (side === 'mine') {
      setMyGivesLines(myGivesLines.filter((_, i) => i !== index));
    } else {
      setTheirGivesLines(theirGivesLines.filter((_, i) => i !== index));
    }
  };

  const handleAddMyPackage = (pkg: PublishedPackageForTrade) => {
    if (myGivesLines.length >= 3) return;
    if (myGivesLines.some((l) => l.packageVersionId === pkg.packageVersionId)) return;
    setMyGivesLines([
      ...myGivesLines,
      {
        packageVersionId: pkg.packageVersionId,
        quantity: 1,
        title: pkg.title,
        indicativeValueMinor: pkg.indicativeValueMinor,
        currencyCode: pkg.currencyCode,
      },
    ]);
  };

  const handleAddTheirPackage = (pkg: PublishedPackageForTrade) => {
    if (theirGivesLines.length >= 3) return;
    if (theirGivesLines.some((l) => l.packageVersionId === pkg.packageVersionId)) return;
    setTheirGivesLines([
      ...theirGivesLines,
      {
        packageVersionId: pkg.packageVersionId,
        quantity: 1,
        title: pkg.title,
        indicativeValueMinor: pkg.indicativeValueMinor,
        currencyCode: pkg.currencyCode,
      },
    ]);
  };

  // Convert lines for BalanceMeter
  const myLinesForMeter = myGivesLines.map((l) => ({
    indicativeValueMinor: l.indicativeValueMinor,
    quantity: l.quantity,
  }));
  const theirLinesForMeter = theirGivesLines.map((l) => ({
    indicativeValueMinor: l.indicativeValueMinor,
    quantity: l.quantity,
  }));
  const currencyCode = myGivesLines[0]?.currencyCode || theirGivesLines[0]?.currencyCode || 'KES';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (proposerLines.length === 0 || recipientLines.length === 0) {
      setErrorMsg('Both sides must include between 1 and 3 service package lines.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set('agreementId', agreementId);
      formData.set('expectedRevisionNo', String(expectedRevisionNo));
      formData.set(
        'proposerLines',
        JSON.stringify(
          proposerLines.map((l) => ({
            packageVersionId: l.packageVersionId,
            quantity: l.quantity,
          }))
        )
      );
      formData.set(
        'recipientLines',
        JSON.stringify(
          recipientLines.map((l) => ({
            packageVersionId: l.packageVersionId,
            quantity: l.quantity,
          }))
        )
      );
      if (note.trim()) {
        formData.set('note', note.trim());
      }
      formData.set('idempotencyKey', crypto.randomUUID());

      const res = await counterTradeAction(null, formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="counter-offer-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl bg-surface rounded-card border border-border shadow-elevation-3 my-8 p-6 text-start space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-pine-600" />
              <h2 id="counter-offer-title" className="text-xl font-bold tracking-tight text-ink">
                Counter-Offer Revision #{expectedRevisionNo + 1}
              </h2>
            </div>
            <p className="text-sm text-text-secondary mt-1">
              Adjust lines or quantities. Once submitted, the turn flips back to{' '}
              <strong className="text-ink">{counterpartyName}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-button text-text-muted hover:text-ink hover:bg-surface-sunken transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-button border border-amber-700/40 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Services I Give */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
                Services You Deliver ({myGivesLines.length}/3 lines)
              </Label>
              {myGivesLines.length < 3 && myPackages.length > 0 && (
                <div className="relative inline-block text-left">
                  <select
                    className="text-xs border border-border rounded-button bg-surface px-2 py-1 text-ink focus:outline-none focus:ring-1 focus:ring-pine-500"
                    onChange={(e) => {
                      const selected = myPackages.find((p) => p.packageVersionId === e.target.value);
                      if (selected) handleAddMyPackage(selected);
                      e.target.value = '';
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      + Add another package
                    </option>
                    {myPackages
                      .filter((p) => !myGivesLines.some((l) => l.packageVersionId === p.packageVersionId))
                      .map((p) => (
                        <option key={p.packageVersionId} value={p.packageVersionId}>
                          {p.title}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {myGivesLines.map((line, idx) => (
                <div
                  key={line.packageVersionId}
                  className="flex items-center justify-between p-3 rounded-card border border-border bg-surface-sunken/40"
                >
                  <div className="min-w-0 flex-1 me-4">
                    <p className="text-sm font-medium text-ink truncate">{line.title}</p>
                    <p className="text-xs text-text-muted">
                      Unit value: {formatIndicativeValue(line.indicativeValueMinor, line.currencyCode)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-border rounded-button bg-surface">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity('mine', idx, -1)}
                        className="px-2.5 py-1 text-sm font-semibold text-ink hover:bg-surface-sunken transition-colors"
                        disabled={line.quantity <= 1}
                      >
                        -
                      </button>
                      <span className="px-2 text-sm font-semibold text-ink min-w-[2rem] text-center">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity('mine', idx, 1)}
                        className="px-2.5 py-1 text-sm font-semibold text-ink hover:bg-surface-sunken transition-colors"
                        disabled={line.quantity >= 99}
                      >
                        +
                      </button>
                    </div>
                    {myGivesLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine('mine', idx)}
                        className="p-1.5 text-text-muted hover:text-amber-800 transition-colors"
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Services They Give */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
                Services {counterpartyName} Delivers ({theirGivesLines.length}/3 lines)
              </Label>
              {theirGivesLines.length < 3 && counterpartyPackages.length > 0 && (
                <select
                  className="text-xs border border-border rounded-button bg-surface px-2 py-1 text-ink focus:outline-none focus:ring-1 focus:ring-pine-500"
                  onChange={(e) => {
                    const selected = counterpartyPackages.find((p) => p.packageVersionId === e.target.value);
                    if (selected) handleAddTheirPackage(selected);
                    e.target.value = '';
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    + Request another package
                  </option>
                  {counterpartyPackages
                    .filter((p) => !theirGivesLines.some((l) => l.packageVersionId === p.packageVersionId))
                    .map((p) => (
                      <option key={p.packageVersionId} value={p.packageVersionId}>
                        {p.title}
                      </option>
                    ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              {theirGivesLines.map((line, idx) => (
                <div
                  key={line.packageVersionId}
                  className="flex items-center justify-between p-3 rounded-card border border-border bg-surface-sunken/40"
                >
                  <div className="min-w-0 flex-1 me-4">
                    <p className="text-sm font-medium text-ink truncate">{line.title}</p>
                    <p className="text-xs text-text-muted">
                      Unit value: {formatIndicativeValue(line.indicativeValueMinor, line.currencyCode)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-border rounded-button bg-surface">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity('theirs', idx, -1)}
                        className="px-2.5 py-1 text-sm font-semibold text-ink hover:bg-surface-sunken transition-colors"
                        disabled={line.quantity <= 1}
                      >
                        -
                      </button>
                      <span className="px-2 text-sm font-semibold text-ink min-w-[2rem] text-center">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity('theirs', idx, 1)}
                        className="px-2.5 py-1 text-sm font-semibold text-ink hover:bg-surface-sunken transition-colors"
                        disabled={line.quantity >= 99}
                      >
                        +
                      </button>
                    </div>
                    {theirGivesLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine('theirs', idx)}
                        className="p-1.5 text-text-muted hover:text-amber-800 transition-colors"
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Live Balance Meter */}
          <BalanceMeter
            myLines={myLinesForMeter}
            theirLines={theirLinesForMeter}
            currencyCode={currencyCode}
          />

          {/* Section 4: Note */}
          <div className="space-y-1.5">
            <Label htmlFor="counter-note" className="text-xs font-semibold text-ink">
              Reason / Revision Note (Optional)
            </Label>
            <Textarea
              id="counter-note"
              value={note}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value.slice(0, 500))}
              placeholder="Explain why you adjusted quantities or packages to help reach an agreement..."
              className="h-20 text-xs"
              maxLength={500}
            />
            <p className="text-[11px] text-text-muted text-end">{note.length}/500 chars</p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || myGivesLines.length === 0 || theirGivesLines.length === 0}
              className="bg-pine-600 hover:bg-pine-700 text-white min-w-[140px]"
            >
              {isPending ? 'Sending...' : 'Send Counter-Offer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
