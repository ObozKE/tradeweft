'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { acceptTradeAction } from '../actions/agreement.actions';
import {
  CheckCircle2,
  AlertCircle,
  X,
  Shield,
  Phone,
  Mail,
  MessageSquare,
} from 'lucide-react';

interface AcceptTradeModalProps {
  agreementId: string;
  expectedRevisionNo: number;
  isOpen: boolean;
  onClose: () => void;
  counterpartyName: string;
  userPhone?: string | null;
  userWhatsapp?: boolean;
}

export function AcceptTradeModal({
  agreementId,
  expectedRevisionNo,
  isOpen,
  onClose,
  counterpartyName,
  userPhone = '',
  userWhatsapp = true,
}: AcceptTradeModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [shareEmail, setShareEmail] = useState(true);
  const [sharePhone, setSharePhone] = useState(Boolean(userPhone));
  const [shareWhatsapp, setShareWhatsapp] = useState(userWhatsapp);
  const [phoneInput, setPhoneInput] = useState(userPhone || '');
  const [isWhatsappAvailable, setIsWhatsappAvailable] = useState(userWhatsapp);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const channels: ('email' | 'phone' | 'whatsapp')[] = [];
    if (shareEmail) channels.push('email');
    if (sharePhone) channels.push('phone');
    if (shareWhatsapp) channels.push('whatsapp');

    if (channels.length === 0) {
      setErrorMsg('Please select at least one contact channel to share upon acceptance.');
      return;
    }

    if ((sharePhone || shareWhatsapp) && !phoneInput.trim()) {
      setErrorMsg('Please enter a valid phone number to share phone or WhatsApp contact details.');
      return;
    }

    startTransition(async () => {
      const res = await acceptTradeAction(
        agreementId,
        expectedRevisionNo,
        channels,
        phoneInput.trim() || undefined,
        isWhatsappAvailable
      );

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
      aria-labelledby="accept-trade-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg bg-surface rounded-card border border-border shadow-elevation-3 p-6 text-start space-y-6">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-pine-600 shrink-0" />
            <h2 id="accept-trade-title" className="text-lg font-bold tracking-tight text-ink">
              Accept Trade Terms (Revision #{expectedRevisionNo})
            </h2>
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

        <p className="text-xs text-text-secondary">
          By accepting, this agreement transitions into <strong className="text-ink">active contract</strong> status.
          Both parties&apos; agreed lines are locked with a cryptographic terms hash stamp.
        </p>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-button border border-amber-700/40 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-card border border-border bg-surface-sunken/40 p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
              Contact Sharing Consent (Revealed to {counterpartyName})
            </h4>

            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareEmail}
                  onChange={(e) => setShareEmail(e.target.checked)}
                  className="rounded border-input-border text-pine-600 focus:ring-pine-500 h-4 w-4"
                />
                <Mail className="h-4 w-4 text-pine-600" />
                <span>Share your account email address</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={sharePhone}
                  onChange={(e) => setSharePhone(e.target.checked)}
                  className="rounded border-input-border text-pine-600 focus:ring-pine-500 h-4 w-4"
                />
                <Phone className="h-4 w-4 text-pine-600" />
                <span>Share phone number for calls</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareWhatsapp}
                  onChange={(e) => setShareWhatsapp(e.target.checked)}
                  className="rounded border-input-border text-pine-600 focus:ring-pine-500 h-4 w-4"
                />
                <MessageSquare className="h-4 w-4 text-pine-600" />
                <span>Share WhatsApp direct messaging</span>
              </label>
            </div>

            {(sharePhone || shareWhatsapp) && (
              <div className="pt-2 border-t border-border space-y-2">
                <Label htmlFor="accept-phone" className="text-xs font-medium text-ink">
                  Phone Number (e.g. 0712 345 678 or +254 712 345 678)
                </Label>
                <Input
                  id="accept-phone"
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+254 712 345 678"
                  className="text-xs h-9"
                  required={sharePhone || shareWhatsapp}
                />
              </div>
            )}
          </div>

          {/* Trade Terms v2 Consent Notice */}
          <div className="rounded-lg bg-surface-sunken p-3 border border-border">
            <label className="flex items-start gap-2.5 text-xs text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                required
                defaultChecked
                className="mt-0.5 rounded border-input-border text-pine-600 focus:ring-pine-500 h-4 w-4"
              />
              <span>
                I agree to the{' '}
                <a
                  href="/trust#terms"
                  target="_blank"
                  className="font-semibold text-pine-700 hover:underline"
                >
                  Trade Terms (v2026-10-v2)
                </a>
                , including SHA-256 contract hash stamping and recording of completed trade milestones in the Public Trust Ledger.
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-pine-600 hover:bg-pine-700 text-white min-w-[140px]"
            >
              {isPending ? 'Accepting...' : 'Sign & Accept Terms'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
