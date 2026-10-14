'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BalanceMeter } from './BalanceMeter';
import { proposeTradeAction } from '../actions/agreement.actions';
import { formatIndicativeValue } from '@/features/packages/utils/currency';
import { ReputationBadge } from '@/features/trust/components/ReputationBadge';
import {
  ArrowLeftRight,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Shield,
  Sparkles,
  Phone,
  Mail,
  MessageSquare,
} from 'lucide-react';

export interface PublishedPackageOption {
  packageId: string;
  packageVersionId: string;
  title: string;
  summary: string;
  categoryId: string;
  indicativeValueMinor: number | null;
  currencyCode: string;
  capacityPerMonth?: number | null;
}

interface ProposeTradeDialogProps {
  recipientProviderId: string;
  recipientProviderName: string;
  recipientReputationTier?: 'new' | 'building' | 'established' | null;
  recipientReliabilityScore?: number | null;
  recipientScoreVisible?: boolean | null;
  recipientPackage: {
    packageId: string;
    packageVersionId: string;
    title: string;
    indicativeValueMinor: number | null;
    currencyCode: string;
    seekingCategoryIds: string[];
  };
  myPackages: PublishedPackageOption[];
  userPhone?: string | null;
  userWhatsapp?: boolean;
}

export function ProposeTradeDialog({
  recipientProviderId,
  recipientProviderName,
  recipientReputationTier,
  recipientReliabilityScore,
  recipientScoreVisible,
  recipientPackage,
  myPackages,
  userPhone,
  userWhatsapp = true,
}: ProposeTradeDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Selected lines that I offer (1 to 3 lines)
  const [myLines, setMyLines] = useState<Array<{ packageVersionId: string; quantity: number }>>(() => {
    // Default to the first published package if available
    if (myPackages.length > 0) {
      return [{ packageVersionId: myPackages[0].packageVersionId, quantity: 1 }];
    }
    return [];
  });

  // Recipient lines (pre-filled with the current package, quantity 1)
  const [recipientQuantity, setRecipientQuantity] = useState<number>(1);

  // Proposal note
  const [note, setNote] = useState<string>('');

  // Contact sharing preferences
  const [channels, setChannels] = useState<string[]>(['phone', 'whatsapp', 'email']);
  const [phoneInput, setPhoneInput] = useState<string>(userPhone || '');
  const [whatsappOptIn, setWhatsappOptIn] = useState<boolean>(userWhatsapp);

  // Trade terms consent checkbox
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Form error feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Helper: toggle contact channel
  const toggleChannel = (channel: string) => {
    if (channels.includes(channel)) {
      if (channels.length > 1) {
        setChannels(channels.filter((c) => c !== channel));
      }
    } else {
      setChannels([...channels, channel]);
    }
  };

  // Helper: add package line
  const addMyLine = () => {
    if (myLines.length >= 3) return;
    const unused = myPackages.find((p) => !myLines.some((l) => l.packageVersionId === p.packageVersionId));
    if (unused) {
      setMyLines([...myLines, { packageVersionId: unused.packageVersionId, quantity: 1 }]);
    } else if (myPackages.length > 0) {
      setMyLines([...myLines, { packageVersionId: myPackages[0].packageVersionId, quantity: 1 }]);
    }
  };

  const removeMyLine = (index: number) => {
    if (myLines.length <= 1) return;
    setMyLines(myLines.filter((_, idx) => idx !== index));
  };

  const updateMyLineVersion = (index: number, versionId: string) => {
    const updated = [...myLines];
    updated[index].packageVersionId = versionId;
    setMyLines(updated);
  };

  const updateMyLineQty = (index: number, qty: number) => {
    const updated = [...myLines];
    updated[index].quantity = Math.max(1, Math.min(99, qty));
    setMyLines(updated);
  };

  // Prepare line items for balance meter
  const valuedMyLines = myLines.map((l) => {
    const pkg = myPackages.find((p) => p.packageVersionId === l.packageVersionId);
    return {
      indicativeValueMinor: pkg?.indicativeValueMinor ?? null,
      quantity: l.quantity,
    };
  });

  const valuedTheirLines = [
    {
      indicativeValueMinor: recipientPackage.indicativeValueMinor,
      quantity: recipientQuantity,
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (myPackages.length === 0) {
      setErrorMessage('You must publish at least one service package before proposing a trade.');
      return;
    }

    if (myLines.length === 0) {
      setErrorMessage('Please select at least one service package to offer.');
      return;
    }

    if (!termsAccepted) {
      setErrorMessage('Please accept the Trade Terms notice before submitting your proposal.');
      return;
    }

    const formData = new FormData();
    formData.append('recipientId', recipientProviderId);
    formData.append('proposerLines', JSON.stringify(myLines));
    formData.append(
      'recipientLines',
      JSON.stringify([{ packageVersionId: recipientPackage.packageVersionId, quantity: recipientQuantity }])
    );
    if (note.trim()) formData.append('note', note.trim());
    formData.append('consentedChannels', JSON.stringify(channels));
    if (phoneInput.trim()) formData.append('phone', phoneInput.trim());
    formData.append('whatsapp', whatsappOptIn ? 'true' : 'false');
    formData.append('idempotencyKey', crypto.randomUUID());

    startTransition(async () => {
      const res = await proposeTradeAction(null, formData);
      if (res.error) {
        setErrorMessage(res.error);
      } else if (res.success && res.agreementId) {
        setIsOpen(false);
        router.push(`/dashboard/trades/${res.agreementId}`);
      }
    });
  };

  if (!isOpen) {
    return (
      <Button
        variant="primary"
        onClick={() => setIsOpen(true)}
        className="w-full h-12 text-sm font-semibold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
      >
        <ArrowLeftRight className="h-4 w-4" />
        Propose a Trade
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl border border-border space-y-6 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-chip bg-pine-100 px-2.5 py-0.5 text-xs font-semibold text-pine-800 mb-1">
              <ArrowLeftRight className="h-3 w-3" />
              Barter Negotiation
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-ink">
                Propose Trade to {recipientProviderName}
              </h2>
              {recipientReputationTier && (
                <ReputationBadge
                  tier={recipientReputationTier}
                  score={recipientReliabilityScore}
                  isScoreVisible={recipientScoreVisible}
                  size="sm"
                />
              )}
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              Specify your barter terms. No upfront money changes hands.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-full p-1.5 text-text-muted hover:bg-surface-sunken hover:text-ink transition"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2 rounded-button bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: What you are requesting from Recipient */}
          <div className="rounded-card border border-border bg-surface-sunken/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
                1. You Receive from {recipientProviderName}
              </h3>
              <span className="text-xs text-text-muted">Requested Package</span>
            </div>

            <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-button border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{recipientPackage.title}</p>
                <p className="text-xs text-text-muted">
                  Indicative value: {formatIndicativeValue(recipientPackage.indicativeValueMinor, recipientPackage.currencyCode)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="recip-qty" className="text-xs text-text-secondary">Qty:</Label>
                <Input
                  id="recip-qty"
                  type="number"
                  min={1}
                  max={99}
                  value={recipientQuantity}
                  onChange={(e) => setRecipientQuantity(Math.max(1, Math.min(99, Number(e.target.value))))}
                  className="w-16 h-9 text-center font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Section 2: What you are offering */}
          <div className="rounded-card border border-pine-200 bg-pine-50/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-pine-900">
                2. You Offer in Return (1 to 3 Packages)
              </h3>
              <span className="text-xs text-pine-700 font-medium">
                {myLines.length}/3 lines
              </span>
            </div>

            {myPackages.length === 0 ? (
              <div className="bg-white p-4 rounded-button border border-amber-200 text-center space-y-2">
                <AlertCircle className="h-6 w-6 text-amber-700 mx-auto" />
                <p className="text-xs text-amber-900 font-medium">
                  You do not have any published service packages yet.
                </p>
                <p className="text-xs text-text-muted">
                  Please create and publish a service package in your dashboard before proposing trades.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {myLines.map((line, idx) => {
                  const selectedPkg = myPackages.find((p) => p.packageVersionId === line.packageVersionId);
                  const isSought = selectedPkg && recipientPackage.seekingCategoryIds.includes(selectedPkg.categoryId);

                  return (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-button border border-border"
                    >
                      <div className="flex-1 space-y-1">
                        <select
                          value={line.packageVersionId}
                          onChange={(e) => updateMyLineVersion(idx, e.target.value)}
                          className="w-full h-9 rounded-input border border-border px-2.5 text-xs text-ink font-medium bg-white focus:outline-none focus:ring-2 focus:ring-pine-500"
                        >
                          {myPackages.map((pkg) => {
                            const soughtMatch = recipientPackage.seekingCategoryIds.includes(pkg.categoryId);
                            return (
                              <option key={pkg.packageVersionId} value={pkg.packageVersionId}>
                                {pkg.title} {soughtMatch ? '★ (Provider seeks this!)' : ''} (
                                {formatIndicativeValue(pkg.indicativeValueMinor, pkg.currencyCode)})
                              </option>
                            );
                          })}
                        </select>

                        {isSought && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-pine-700">
                            <Sparkles className="h-3 w-3" />
                            Matches what this provider is looking for!
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <Label className="text-xs text-text-secondary">Qty:</Label>
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          value={line.quantity}
                          onChange={(e) => updateMyLineQty(idx, Number(e.target.value))}
                          className="w-16 h-9 text-center font-semibold"
                        />
                        {myLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMyLine(idx)}
                            className="p-1.5 text-text-muted hover:text-amber-800 transition"
                            title="Remove offering line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {myLines.length < 3 && myPackages.length > myLines.length && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addMyLine}
                    className="w-full text-xs h-9 border-dashed text-pine-800 hover:bg-pine-50"
                  >
                    <Plus className="h-3.5 w-3.5 me-1" />
                    Add Another Service Offering
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Advisory Balance Meter */}
          <BalanceMeter
            myLines={valuedMyLines}
            theirLines={valuedTheirLines}
            currencyCode={recipientPackage.currencyCode}
          />

          {/* Section 4: Negotiation Note */}
          <div className="space-y-1.5">
            <Label htmlFor="proposal-note" className="text-xs font-semibold text-ink">
              Proposal Note & Scope Clarifications (Optional)
            </Label>
            <Textarea
              id="proposal-note"
              value={note}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value.slice(0, 500))}
              placeholder="e.g. Happy to adjust deliverable turnaround if needed. Looking forward to trading with you!"
              className="h-20 text-xs"
              maxLength={500}
            />
            <p className="text-[11px] text-text-muted text-end">{note.length}/500 chars</p>
          </div>

          {/* Section 5: Contact Sharing Consent */}
          <div className="rounded-card border border-border bg-surface-sunken/40 p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
              Contact Exchange Consent (Revealed ONLY Once Trade is Accepted)
            </h4>
            <p className="text-xs text-text-muted">
              Select which communication channels you consent to share with {recipientProviderName} upon contract acceptance:
            </p>

            <div className="grid grid-cols-3 gap-2">
              <label
                className={`flex items-center gap-2 p-2.5 rounded-button border text-xs font-medium cursor-pointer transition ${
                  channels.includes('phone')
                    ? 'border-pine-400 bg-pine-50 text-pine-900'
                    : 'border-border bg-white text-text-secondary'
                }`}
              >
                <input
                  type="checkbox"
                  checked={channels.includes('phone')}
                  onChange={() => toggleChannel('phone')}
                  className="rounded text-pine-600 focus:ring-pine-500"
                />
                <Phone className="h-3.5 w-3.5" />
                Phone
              </label>

              <label
                className={`flex items-center gap-2 p-2.5 rounded-button border text-xs font-medium cursor-pointer transition ${
                  channels.includes('whatsapp')
                    ? 'border-pine-400 bg-pine-50 text-pine-900'
                    : 'border-border bg-white text-text-secondary'
                }`}
              >
                <input
                  type="checkbox"
                  checked={channels.includes('whatsapp')}
                  onChange={() => toggleChannel('whatsapp')}
                  className="rounded text-pine-600 focus:ring-pine-500"
                />
                <MessageSquare className="h-3.5 w-3.5" />
                WhatsApp
              </label>

              <label
                className={`flex items-center gap-2 p-2.5 rounded-button border text-xs font-medium cursor-pointer transition ${
                  channels.includes('email')
                    ? 'border-pine-400 bg-pine-50 text-pine-900'
                    : 'border-border bg-white text-text-secondary'
                }`}
              >
                <input
                  type="checkbox"
                  checked={channels.includes('email')}
                  onChange={() => toggleChannel('email')}
                  className="rounded text-pine-600 focus:ring-pine-500"
                />
                <Mail className="h-3.5 w-3.5" />
                Email
              </label>
            </div>

            {(channels.includes('phone') || channels.includes('whatsapp')) && (
              <div className="pt-1 space-y-1.5">
                <Label htmlFor="phone-input" className="text-xs text-text-secondary">
                  Your Phone Number (Kenya Mobile):
                </Label>
                <Input
                  id="phone-input"
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="e.g. 0712 345 678 or +254 712 345 678"
                  className="h-9 text-xs"
                />
              </div>
            )}
          </div>

          {/* Section 6: Trade Terms Notice */}
          <div className="rounded-button bg-surface-sunken p-3 text-xs text-text-secondary space-y-2 border border-border">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 shrink-0 text-pine-700 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                <strong>Trade Terms Notice (v2026-10-v2):</strong> Trade Weft is a B2B barter marketplace. Accepted barter agreements are cryptographically hash-stamped and completed milestones are recorded in the Public Trust Ledger with mutual consent. Both parties agree to deliver services in good faith.
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="rounded text-pine-600 focus:ring-pine-500"
              />
              <span>I acknowledge and accept the Trade Terms (v2026-10-v2)</span>
            </label>
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isPending || myPackages.length === 0 || !termsAccepted}
              className="h-10 px-5"
            >
              {isPending ? 'Sending Proposal...' : 'Send Trade Proposal'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
