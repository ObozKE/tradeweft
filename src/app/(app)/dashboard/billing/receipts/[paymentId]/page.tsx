import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireOnboardedUser } from '@/server/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatMinorMoney, calculateTaxBreakdown } from '@/features/payments/utils/money';
import { PrintReceiptButton } from '@/features/payments/components/PrintReceiptButton';
import { ShieldCheck, Check, ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Payment Receipt | Trade Weft',
  description: 'Official Trade Weft Safaricom M-Pesa payment receipt and tax invoice.',
};

interface ReceiptPageProps {
  params: Promise<{ paymentId: string }>;
}

export default async function PaymentReceiptPage({ params }: ReceiptPageProps) {
  const { paymentId } = await params;
  const { user, profile } = await requireOnboardedUser();
  const adminSupabase = createAdminClient();

  // Fetch payment
  const { data: payment, error } = await adminSupabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (error || !payment) {
    notFound();
  }

  // Authorize: must be payer
  if (payment.payer_id !== user.id) {
    notFound();
  }

  const snapshot = (payment.price_snapshot as any) || {};
  const amountMinor = Number(payment.amount_minor);
  const tax = calculateTaxBreakdown(amountMinor, 0.16);

  const productTitle =
    payment.purpose === 'boost_period'
      ? `Trade Weft ${snapshot.plan_name || 'Boost Plan'} (30 Days)`
      : payment.purpose === 'top_ad'
      ? `Top Ad Pinned Placement (${snapshot.durationDays || 7} Days)`
      : payment.purpose;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back & Print Action Bar (Hidden when printing) */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/dashboard/billing"
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-ink font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Billing
        </Link>
        <PrintReceiptButton />
      </div>

      {/* Official Printable Receipt Card */}
      <div className="rounded-2xl border border-border bg-white p-8 sm:p-12 shadow-sm text-ink space-y-8 print:border-none print:shadow-none print:p-0">
        {/* Receipt Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-border pb-8">
          <div>
            <div className="text-xl font-extrabold text-pine-800 tracking-tight">
              Trade Weft Kenya Limited
            </div>
            <div className="text-xs text-text-muted mt-1 leading-relaxed">
              B2B Cash-Free Barter Marketplace<br />
              Nairobi, Kenya • PIN P051234567X<br />
              support@tradeweft.com
            </div>
          </div>

          <div className="sm:text-end">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-pine-50 text-pine-800 border border-pine-200">
              <Check className="h-3 w-3" />
              OFFICIAL TAX RECEIPT
            </span>
            <div className="text-sm font-mono font-bold text-ink mt-2">
              TW-{payment.id.slice(0, 8).toUpperCase()}
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              {new Date(payment.created_at).toLocaleDateString('en-KE', {
                dateStyle: 'full',
                timeZone: 'Africa/Nairobi',
              })}
            </div>
          </div>
        </div>

        {/* Customer & Transaction Meta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
          <div>
            <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1">
              Billed To:
            </div>
            <div className="font-bold text-ink">{profile.display_name || user.email}</div>
            <div className="text-text-secondary">{user.email}</div>
            {payment.msisdn && (
              <div className="text-text-muted font-mono mt-0.5">M-Pesa: {payment.msisdn}</div>
            )}
          </div>

          <div className="sm:text-end">
            <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1">
              Payment Method:
            </div>
            <div className="font-bold text-ink">Safaricom M-Pesa Express</div>
            <div className="text-text-secondary">
              Receipt No:{' '}
              <span className="font-mono font-bold text-pine-800">
                {payment.receipt_number || 'PENDING'}
              </span>
            </div>
            <div className="text-text-muted capitalize">Status: {payment.status}</div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-start text-xs">
            <thead className="bg-sand-50/50 border-b border-border text-text-muted text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-4 text-start font-semibold">Description</th>
                <th className="py-2.5 px-4 text-center font-semibold">Qty</th>
                <th className="py-2.5 px-4 text-end font-semibold">Amount (KES)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-3 px-4 font-semibold text-ink">{productTitle}</td>
                <td className="py-3 px-4 text-center text-text-secondary">1</td>
                <td className="py-3 px-4 text-end font-bold text-ink">
                  {formatMinorMoney(amountMinor, payment.currency_code)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Tax Breakdown & Totals */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pt-2">
          <div className="text-[11px] text-text-muted max-w-xs leading-relaxed">
            <ShieldCheck className="h-4 w-4 text-pine-700 inline me-1" />
            Barter transactions between businesses carry 0% platform commissions. This receipt covers
            optional capacity and listing promotion only.
          </div>

          <div className="w-full sm:w-64 space-y-2 text-xs">
            <div className="flex justify-between text-text-secondary">
              <span>Subtotal (Net)</span>
              <span>{formatMinorMoney(tax.netAmountMinor, payment.currency_code)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>VAT (16%)</span>
              <span>{formatMinorMoney(tax.taxAmountMinor, payment.currency_code)}</span>
            </div>
            <div className="pt-2 border-t border-border flex justify-between font-extrabold text-sm text-pine-900">
              <span>Total Paid</span>
              <span>{formatMinorMoney(amountMinor, payment.currency_code)}</span>
            </div>
          </div>
        </div>

        {/* Receipt Footer */}
        <div className="border-t border-border pt-6 text-center text-[11px] text-text-muted">
          Thank you for trading on Trade Weft • Electronic Receipt Generated by Trade Weft Monetization Engine
        </div>
      </div>
    </div>
  );
}
