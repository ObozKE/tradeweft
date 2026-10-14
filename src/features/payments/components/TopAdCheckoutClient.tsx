'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Clock,
  Check,
  AlertCircle,
  Smartphone,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  initiateTopAdPaymentAction,
  getPaymentStatusAction,
  checkSlotAvailabilityAction,
  type SlotAvailabilityResult,
} from '../actions/top-ad.actions';
import { formatMinorMoney } from '../utils/money';

interface DurationOption {
  id: 'top_ad_7d' | 'top_ad_14d' | 'top_ad_30d';
  days: number;
  label: string;
  priceMinor: number;
}

interface TopAdCheckoutProps {
  packageId: string;
  packageTitle: string;
  cityName: string;
  categoryName: string;
  durations: DurationOption[];
  userPhoneDefault?: string;
  initialAvailability?: SlotAvailabilityResult;
}

export function TopAdCheckoutClient({
  packageId,
  packageTitle,
  cityName,
  categoryName,
  durations,
  userPhoneDefault = '',
  initialAvailability,
}: TopAdCheckoutProps) {
  const router = useRouter();
  const [selectedProductId, setSelectedProductId] = useState<'top_ad_7d' | 'top_ad_14d' | 'top_ad_30d'>(
    'top_ad_7d'
  );
  const [phoneNumber, setPhoneNumber] = useState(userPhoneDefault);
  const [availability, setAvailability] = useState<SlotAvailabilityResult | null>(
    initialAvailability || null
  );
  const [isCheckingSlots, setIsCheckingSlots] = useState(!initialAvailability);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedDuration = durations.find((d) => d.id === selectedProductId) || durations[0];
  const initialDaysRef = React.useRef(selectedDuration.days);
  const isInitialMount = React.useRef(true);

  // Check slot availability only when duration changes or if initial wasn't provided
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (initialAvailability && selectedDuration.days === initialDaysRef.current) {
        return;
      }
    }

    let isMounted = true;
    async function checkSlots() {
      setIsCheckingSlots(true);
      try {
        const res = await checkSlotAvailabilityAction(packageId, selectedDuration.days);
        if (isMounted && res.success) {
          setAvailability(res.data);
        }
      } catch (err) {
        console.error('Failed to check slots', err);
      } finally {
        if (isMounted) setIsCheckingSlots(false);
      }
    }
    checkSlots();
    return () => {
      isMounted = false;
    };
  }, [packageId, selectedDuration.days, initialAvailability]);

  // Poll status while payment is pending (with 90-second timeout)
  useEffect(() => {
    const isTerminal = (s: string | null) =>
      ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(s || '');

    if (!activePaymentId || isTerminal(paymentStatus)) {
      return;
    }

    let pollCount = 0;
    const maxPolls = 36; // 36 * 2.5s = 90 seconds (Daraja STK push timeout window)

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
              router.push('/dashboard/billing');
            }, 2500);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const idempotencyKey = `topad_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await initiateTopAdPaymentAction({
        packageId,
        productId: selectedProductId,
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left 2 Cols: Form and Duration Selection */}
      <div className="lg:col-span-2 space-y-6">
        {/* Promotion Context Card */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
              <Sparkles className="h-3 w-3" />
              Top Ad Pinned Placement
            </span>
          </div>
          <h2 className="text-lg font-bold text-ink">{packageTitle}</h2>
          <p className="text-xs text-text-secondary mt-1">
            Target: <strong>{categoryName}</strong> in <strong>{cityName}</strong>
          </p>

          {/* Slot Availability Indicator */}
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs">
            <span className="text-text-muted">Slot Availability:</span>
            {isCheckingSlots ? (
              <span className="text-text-muted flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking slots...
              </span>
            ) : availability?.isAvailable ? (
              <span className="font-semibold text-pine-700 flex items-center gap-1">
                <Check className="h-3.5 w-3.5" />
                Slot #{availability.assignedSlot} Available ({availability.availableSlots}/3 open)
              </span>
            ) : (
              <span className="font-semibold text-amber-700 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                All 3 slots currently booked for this duration
              </span>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-50/50 p-4 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Payment Error:</strong> {errorMessage}
            </div>
          </div>
        )}

        {/* If Active Payment In Progress */}
        {activePaymentId ? (
          <div className="rounded-2xl border border-border bg-surface p-8 shadow-xs text-center space-y-4">
            {paymentStatus === 'succeeded' ? (
              <>
                <div className="mx-auto h-12 w-12 rounded-full bg-pine-600 text-white flex items-center justify-center">
                  <Check className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-pine-900">
                    Promotion Activated!
                  </h3>
                  <p className="text-xs text-pine-700 mt-1">
                    Your package is now pinned in {categoryName} for {cityName}. Redirecting to billing...
                  </p>
                </div>
              </>
            ) : paymentStatus === 'failed' || paymentStatus === 'cancelled' || paymentStatus === 'timed_out' ? (
              <>
                <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                  <AlertCircle className="h-6 w-6 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">Payment Incomplete</h3>
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
                <div className="mx-auto h-12 w-12 rounded-full bg-pine-50 text-pine-700 flex items-center justify-center border border-pine-200">
                  <Loader2 className="h-6 w-6 animate-spin text-pine-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">
                    M-Pesa Prompt Dispatched
                  </h3>
                  <p className="text-xs text-text-secondary mt-1">
                    {statusMessage || 'Please enter your M-Pesa PIN on your phone to confirm.'}
                  </p>
                </div>
                <div className="text-[11px] text-text-muted flex items-center justify-center gap-1.5 pt-2">
                  <Clock className="h-3.5 w-3.5" />
                  Awaiting confirmation from Safaricom...
                </div>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Duration Selector */}
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
              <label className="text-xs font-bold text-ink uppercase tracking-wider block">
                1. Select Promotion Duration
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {durations.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedProductId(opt.id)}
                    className={`rounded-xl border p-4 text-start transition-all ${
                      selectedProductId === opt.id
                        ? 'border-pine-600 bg-pine-50/30 ring-2 ring-pine-600/20'
                        : 'border-border bg-surface hover:bg-surface-raised'
                    }`}
                  >
                    <div className="text-xs font-bold text-ink">{opt.label}</div>
                    <div className="text-xs text-text-muted mt-0.5">{opt.days} Days</div>
                    <div className="text-sm font-extrabold text-pine-800 mt-2">
                      {formatMinorMoney(opt.priceMinor, 'KES')}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* M-Pesa Phone Number */}
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
              <label
                htmlFor="topad-phone"
                className="text-xs font-bold text-ink uppercase tracking-wider block"
              >
                2. M-Pesa Payment Details
              </label>

              <div>
                <div className="relative">
                  <Smartphone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    id="topad-phone"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="0712345678 or 254712345678"
                    required
                    className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2.5 text-xs text-ink placeholder:text-text-muted focus:border-pine-500 focus:outline-none focus:ring-1 focus:ring-pine-500"
                  />
                </div>
                <p className="text-[11px] text-text-muted mt-1.5">
                  Enter your Safaricom phone number. A secure PIN prompt will be sent immediately.
                </p>
              </div>
            </div>

            {/* Checkout Action */}
            <div className="flex items-center justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.back()}
                className="text-xs"
              >
                Cancel
              </Button>

              <Button
                type="submit"
                size="sm"
                disabled={
                  isSubmitting ||
                  !phoneNumber ||
                  (availability !== null && !availability.isAvailable)
                }
                className="bg-pine-600 hover:bg-pine-700 text-white text-xs gap-1.5 shadow-xs px-6 py-2.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sending STK Push...
                  </>
                ) : (
                  <>
                    Pay {formatMinorMoney(selectedDuration.priceMinor, 'KES')} via M-Pesa
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Right Column: Order Summary & Trust Guarantee */}
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Order Summary
          </h3>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-text-secondary">
              <span>Product</span>
              <span className="font-semibold text-ink">Top Ad ({selectedDuration.days}d)</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Location</span>
              <span className="font-semibold text-ink">{cityName}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Category</span>
              <span className="font-semibold text-ink">{categoryName}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Slot Assignment</span>
              <span className="font-semibold text-ink">
                {availability?.assignedSlot ? `Slot #${availability.assignedSlot}` : 'Slot 1-3'}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-border flex justify-between items-baseline">
            <span className="text-xs font-semibold text-ink">Total Due (VAT Incl.)</span>
            <span className="text-lg font-extrabold text-pine-800">
              {formatMinorMoney(selectedDuration.priceMinor, 'KES')}
            </span>
          </div>
        </div>

        {/* Anti-Gaming Notice */}
        <div className="rounded-2xl border border-pine-200 bg-pine-50/40 p-5 space-y-2 text-xs leading-relaxed text-pine-900">
          <div className="flex items-center gap-1.5 font-bold">
            <ShieldCheck className="h-4 w-4 text-pine-700" />
            Clear Promoted Badge
          </div>
          <p>
            Your listing will appear with an amber &ldquo;Promoted&rdquo; badge on page 1 of search.
            Promotions increase visibility but never alter your barter score or verified status.
          </p>
        </div>
      </div>
    </div>
  );
}
