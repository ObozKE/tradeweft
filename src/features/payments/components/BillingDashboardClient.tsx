'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Zap,
  Check,
  Clock,
  AlertCircle,
  Smartphone,
  Loader2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  initiateBoostSubscriptionAction,
  toggleSubscriptionCancellationAction,
} from '../actions/subscription.actions';
import { getPaymentStatusAction } from '../actions/top-ad.actions';
import { formatMinorMoney } from '../utils/money';

interface PlanOption {
  id: 'basic' | 'pro' | 'enterprise';
  name: string;
  priceMinor: number;
  features: string[];
}

interface BillingClientProps {
  currentPlanId: string;
  subscriptionId?: string | null;
  subscriptionStatus?: string | null;
  cancelAtPeriodEnd?: boolean;
  periodEnd?: string | null;
  plans: PlanOption[];
  userPhoneDefault?: string;
}

export function BillingDashboardClient({
  currentPlanId,
  subscriptionId,
  subscriptionStatus,
  cancelAtPeriodEnd,
  periodEnd,
  plans,
  userPhoneDefault = '',
}: BillingClientProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<'basic' | 'pro' | 'enterprise'>(
    currentPlanId === 'pro' || currentPlanId === 'enterprise' ? currentPlanId : 'basic'
  );
  const [phoneNumber, setPhoneNumber] = useState(userPhoneDefault);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTogglingCancel, setIsTogglingCancel] = useState(false);

  // Poll status while payment is pending (with 90-second timeout)
  useEffect(() => {
    const isTerminal = (s: string | null) =>
      ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(s || '');

    if (!activePaymentId || isTerminal(paymentStatus)) {
      return;
    }

    let pollCount = 0;
    const maxPolls = 36; // 36 * 2.5s = 90 seconds

    const interval = setInterval(async () => {
      pollCount++;
      if (pollCount > maxPolls) {
        clearInterval(interval);
        setPaymentStatus('timed_out');
        setStatusMessage('Payment prompt timed out on your phone. Please try again.');
        return;
      }

      try {
        const res = await getPaymentStatusAction(activePaymentId);
        if (res.success) {
          setPaymentStatus(res.data.status);
          setStatusMessage(res.data.userMessage);

          if (res.data.status === 'succeeded') {
            clearInterval(interval);
            setTimeout(() => {
              setIsModalOpen(false);
              router.refresh();
            }, 2000);
          } else if (res.data.isTerminal || isTerminal(res.data.status)) {
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error('Failed to poll payment status', err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activePaymentId, paymentStatus, router]);

  const handleStartUpgrade = (planId: 'basic' | 'pro' | 'enterprise') => {
    setSelectedPlanId(planId);
    setErrorMessage(null);
    setActivePaymentId(null);
    setPaymentStatus(null);
    setStatusMessage('');
    setIsModalOpen(true);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const idempotencyKey = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await initiateBoostSubscriptionAction({
        planId: selectedPlanId,
        phoneNumber,
        idempotencyKey,
      });

      if (!res.success) {
        setErrorMessage(res.error.message);
        setIsSubmitting(false);
        return;
      }

      setActivePaymentId(res.data.paymentId);
      setPaymentStatus('pending');
      setStatusMessage(res.data.customerMessage);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to dispatch payment prompt');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAutoRenew = async () => {
    if (!subscriptionId) return;
    setIsTogglingCancel(true);
    try {
      const res = await toggleSubscriptionCancellationAction(
        subscriptionId,
        !cancelAtPeriodEnd
      );
      if (res.success) {
        router.refresh();
      }
    } finally {
      setIsTogglingCancel(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  return (
    <div>
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-ink">Plan Management</h2>
          <p className="text-xs text-text-secondary">
            Switch plans or renew your prepaid 30-day listing privileges.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {subscriptionId && subscriptionStatus === 'active' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isTogglingCancel}
              onClick={handleToggleAutoRenew}
              className="text-xs"
            >
              {cancelAtPeriodEnd ? 'Resume Auto-Renew' : 'Disable Auto-Renew'}
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={() => handleStartUpgrade('pro')}
            className="bg-pine-600 hover:bg-pine-700 text-white text-xs gap-1.5 shadow-xs"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Upgrade Plan
          </Button>
        </div>
      </div>

      {/* Plans Selection Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-base font-bold text-ink">
                  Subscribe to Boost Plan
                </h3>
                <p className="text-xs text-text-secondary">
                  30-day prepaid plan via Safaricom M-Pesa STK Push
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-text-muted hover:text-ink text-sm p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 p-3 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* If Payment is Pending or Succeeded */}
            {activePaymentId ? (
              <div className="rounded-xl border border-pine-200 bg-pine-50/50 p-6 text-center space-y-4">
                {paymentStatus === 'succeeded' ? (
                  <>
                    <div className="mx-auto h-12 w-12 rounded-full bg-pine-600 text-white flex items-center justify-center">
                      <Check className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-pine-900">
                        Payment Received Successfully!
                      </h4>
                      <p className="text-xs text-pine-700 mt-1">
                        Your Boost benefits are active now. Refreshing your dashboard...
                      </p>
                    </div>
                  </>
                ) : paymentStatus === 'failed' || paymentStatus === 'cancelled' || paymentStatus === 'timed_out' ? (
                  <>
                    <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                      <AlertCircle className="h-6 w-6 text-amber-700" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-ink">
                        Payment Not Completed
                      </h4>
                      <p className="text-xs text-text-secondary mt-1">
                        {statusMessage || 'The transaction was cancelled, timed out, or not completed.'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setActivePaymentId(null);
                        setPaymentStatus(null);
                        setStatusMessage('');
                        setErrorMessage(null);
                      }}
                      className="bg-pine-600 hover:bg-pine-700 text-white text-xs mt-2"
                    >
                      Try Again
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="mx-auto h-12 w-12 rounded-full bg-pine-100 text-pine-700 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-pine-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-ink">
                        Check Your Handset
                      </h4>
                      <p className="text-xs text-text-secondary mt-1">
                        {statusMessage || 'Please enter your M-Pesa PIN on your phone to authorize the payment.'}
                      </p>
                    </div>
                    <div className="text-[11px] text-text-muted flex items-center justify-center gap-1.5 pt-2">
                      <Clock className="h-3.5 w-3.5" />
                      Awaiting PIN authorization from Safaricom...
                    </div>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmitPayment} className="space-y-5">
                {/* Plan Selector */}
                <div>
                  <label className="text-xs font-semibold text-ink block mb-2">
                    Select Plan
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {plans.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPlanId(p.id)}
                        className={`rounded-xl border p-3 text-start transition-all ${
                          selectedPlanId === p.id
                            ? 'border-pine-600 bg-pine-50/30 ring-2 ring-pine-600/20'
                            : 'border-border bg-surface hover:bg-surface-raised'
                        }`}
                      >
                        <div className="text-xs font-bold text-ink">{p.name}</div>
                        <div className="text-xs font-semibold text-pine-800 mt-1">
                          {formatMinorMoney(p.priceMinor, 'KES')}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Plan Details */}
                {selectedPlan && (
                  <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
                    <div className="text-xs font-bold text-ink">
                      Plan Inclusions:
                    </div>
                    <ul className="space-y-1.5 text-xs text-text-secondary">
                      {selectedPlan.features.map((feat, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className="h-3 w-3 text-pine-600 flex-shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Phone Input */}
                <div>
                  <label
                    htmlFor="billing-phone"
                    className="text-xs font-semibold text-ink block mb-1"
                  >
                    M-Pesa Phone Number
                  </label>
                  <div className="relative">
                    <Smartphone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      id="billing-phone"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="0712345678 or 254712345678"
                      required
                      className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-xs text-ink placeholder:text-text-muted focus:border-pine-500 focus:outline-none focus:ring-1 focus:ring-pine-500"
                    />
                  </div>
                  <p className="text-[11px] text-text-muted mt-1">
                    Enter the Safaricom number to receive the prompt.
                  </p>
                </div>

                {/* Submit Button */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsModalOpen(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSubmitting || !phoneNumber}
                    className="bg-pine-600 hover:bg-pine-700 text-white text-xs gap-1.5 shadow-xs"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Sending STK Push...
                      </>
                    ) : (
                      <>
                        Pay {selectedPlan ? formatMinorMoney(selectedPlan.priceMinor, 'KES') : ''}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
