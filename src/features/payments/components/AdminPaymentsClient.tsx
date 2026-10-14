'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, RotateCcw, Loader2, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { adminReconcileAction, adminRefundAction } from '../actions/admin-finance.actions';

interface AdminPaymentsClientProps {
  paymentId: string;
  status: string;
  receiptNumber?: string | null;
}

export function AdminPaymentRowActions({
  paymentId,
  status,
  receiptNumber,
}: AdminPaymentsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleReconcile = () => {
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      const res = await adminReconcileAction(paymentId);
      if (!res.success) {
        setIsError(true);
        setMessage(res.error.message);
      } else {
        setMessage(`Status: ${res.data.status}`);
        router.refresh();
      }
    });
  };

  const handleRefundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      const res = await adminRefundAction(paymentId, refundReason);
      if (!res.success) {
        setIsError(true);
        setMessage(res.error.message);
      } else {
        setIsRefundModalOpen(false);
        setRefundReason('');
        setMessage('Refund recorded in ledger');
        router.refresh();
      }
    });
  };

  return (
    <div className="flex items-center justify-end gap-2 text-xs">
      {message && (
        <span
          className={`text-[11px] font-semibold ${
            isError ? 'text-amber-800' : 'text-pine-800'
          }`}
        >
          {message}
        </span>
      )}

      {/* Manual Reconcile Button */}
      {status !== 'succeeded' && status !== 'refunded' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={handleReconcile}
          className="text-xs h-7 px-2.5 text-text-secondary hover:text-ink"
          title="Query Safaricom Daraja directly"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin me-1" />
          ) : (
            <RefreshCw className="h-3 w-3 me-1 text-pine-600" />
          )}
          Reconcile
        </Button>
      )}

      {/* Record Refund Button (Only for succeeded) */}
      {status === 'succeeded' && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsRefundModalOpen(true)}
            className="text-xs h-7 px-2.5 text-amber-900 border-amber-300 hover:bg-amber-50"
          >
            <RotateCcw className="h-3 w-3 me-1 text-amber-700" />
            Refund
          </Button>

          {/* Refund Confirmation Modal */}
          {isRefundModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs text-start">
              <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-sm font-bold text-ink">
                    Record Manual Refund
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsRefundModalOpen(false)}
                    className="text-text-muted hover:text-ink text-sm p-1"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-xs text-text-secondary leading-relaxed">
                  This will transition payment to <strong>refunded</strong>, cancel active promotions if applicable, and write an immutable refund entry to the payment ledger.
                </p>

                <form onSubmit={handleRefundSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-ink block mb-1">
                      Reason for Refund (Audit Trail)
                    </label>
                    <textarea
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="e.g. Customer duplicate payment or cancelled listing request..."
                      required
                      minLength={5}
                      rows={3}
                      className="w-full rounded-lg border border-border bg-surface p-2.5 text-xs text-ink placeholder:text-text-muted focus:border-pine-500 focus:outline-none focus:ring-1 focus:ring-pine-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsRefundModalOpen(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isPending || refundReason.trim().length < 5}
                      className="bg-amber-700 hover:bg-amber-800 text-white text-xs gap-1.5"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Recording...
                        </>
                      ) : (
                        'Confirm Refund'
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
