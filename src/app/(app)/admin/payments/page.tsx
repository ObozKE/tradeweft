import React from 'react';
import type { Metadata } from 'next';
import { requireFinanceOrAdmin } from '@/server/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatMinorMoney } from '@/features/payments/utils/money';
import { AdminPaymentRowActions } from '@/features/payments/components/AdminPaymentsClient';
import { CreditCard, Search, Filter } from 'lucide-react';
import type { PaymentStatus } from '@/features/payments/types/payment.types';

export const metadata: Metadata = {
  title: 'Payment Operations | Admin | Trade Weft',
  description: 'Manage Safaricom Daraja transactions, reconcile pending orders, and issue manual refunds.',
};

interface AdminPaymentsPageProps {
  searchParams: Promise<{
    status?: string;
    q?: string;
  }>;
}

export default async function AdminPaymentsPage({ searchParams }: AdminPaymentsPageProps) {
  await requireFinanceOrAdmin();
  const { status, q } = await searchParams;

  const adminSupabase = createAdminClient();

  // Query payments
  let query = adminSupabase
    .from('payments')
    .select(`
      id,
      payer_id,
      provider,
      purpose,
      amount_minor,
      currency_code,
      status,
      receipt_number,
      checkout_request_id,
      msisdn,
      created_at,
      profiles (
        display_name,
        country_code
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  const validStatuses: PaymentStatus[] = [
    'created',
    'pending',
    'succeeded',
    'failed',
    'cancelled',
    'timed_out',
    'refunded',
  ];

  if (status && validStatuses.includes(status as PaymentStatus)) {
    query = query.eq('status', status as PaymentStatus);
  }

  if (q && q.trim()) {
    const term = q.trim();
    query = query.or(`receipt_number.ilike.%${term}%,checkout_request_id.ilike.%${term}%,msisdn.ilike.%${term}%`);
  }

  const { data: payments } = await query;

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Payments &amp; Transactions</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Real-time Safaricom M-Pesa transactions and ledger audit logs.
          </p>
        </div>

        <form method="GET" className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              name="q"
              defaultValue={q || ''}
              placeholder="Search receipt, phone, ID..."
              className="rounded-lg border border-border bg-surface pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-text-muted focus:border-pine-500 focus:outline-none"
            />
          </div>

          <select
            name="status"
            defaultValue={status || 'all'}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-pine-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="succeeded">Succeeded</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
            <option value="refunded">Refunded</option>
          </select>

          <button
            type="submit"
            className="rounded-lg bg-pine-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pine-700"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Transactions Table */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
        {!payments || payments.length === 0 ? (
          <div className="py-12 text-center text-xs text-text-muted">
            No payments match your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 text-start font-semibold">Date</th>
                  <th className="py-2.5 text-start font-semibold">Payer</th>
                  <th className="py-2.5 text-start font-semibold">Purpose</th>
                  <th className="py-2.5 text-start font-semibold">Amount</th>
                  <th className="py-2.5 text-start font-semibold">Receipt #</th>
                  <th className="py-2.5 text-start font-semibold">Status</th>
                  <th className="py-2.5 text-end font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((pay: any) => {
                  const profile = pay.profiles;
                  return (
                    <tr key={pay.id} className="hover:bg-surface-raised/50 transition-colors">
                      <td className="py-3 text-text-secondary whitespace-nowrap">
                        {new Date(pay.created_at).toLocaleDateString('en-KE', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3">
                        <div className="font-semibold text-ink">
                          {profile?.display_name || 'Anonymous Payer'}
                        </div>
                        {pay.msisdn && (
                          <div className="text-[11px] text-text-muted font-mono">
                            {pay.msisdn}
                          </div>
                        )}
                      </td>
                      <td className="py-3 capitalize text-text-secondary">
                        {pay.purpose === 'boost_period'
                          ? 'Boost Plan'
                          : pay.purpose === 'top_ad'
                          ? 'Top Ad'
                          : pay.purpose}
                      </td>
                      <td className="py-3 font-bold text-ink">
                        {formatMinorMoney(pay.amount_minor, pay.currency_code)}
                      </td>
                      <td className="py-3 font-mono text-[11px]">
                        {pay.receipt_number || (
                          <span className="text-text-muted">
                            {pay.checkout_request_id ? pay.checkout_request_id.slice(0, 16) + '...' : '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            pay.status === 'succeeded'
                              ? 'bg-pine-50 text-pine-800 border border-pine-200'
                              : pay.status === 'pending'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : pay.status === 'refunded'
                              ? 'bg-sand-200 text-ink'
                              : 'bg-sand-100 text-text-muted'
                          }`}
                        >
                          {pay.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 text-end">
                        <AdminPaymentRowActions
                          paymentId={pay.id}
                          status={pay.status}
                          receiptNumber={pay.receipt_number}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
