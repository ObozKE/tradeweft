import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { requireOnboardedUser } from '@/server/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserEntitlements } from '@/features/payments/utils/entitlements';
import { BillingDashboardClient } from '@/features/payments/components/BillingDashboardClient';
import { formatMinorMoney } from '@/features/payments/utils/money';
import {
  CreditCard,
  Package,
  Sparkles,
  TrendingUp,
  Clock,
  Printer,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Billing & Boost Plans | Trade Weft',
  description: 'Manage your Trade Weft Boost subscription, listing capacity, and payment receipts.',
};

export default async function BillingDashboardPage() {
  const { user, profile } = await requireOnboardedUser();
  const adminSupabase = createAdminClient();

  // 1. Fetch entitlements
  const entitlements = await getUserEntitlements(user.id);

  // 2. Fetch published packages count
  const { count: publishedCount } = await adminSupabase
    .from('service_packages')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', user.id)
    .eq('status', 'published');

  const activeCount = publishedCount || 0;
  const packageLimit = entitlements.max_active_packages;
  const percentageUsed = Math.min(100, Math.round((activeCount / packageLimit) * 100));

  // 3. Fetch active subscription
  const { data: subscription } = await adminSupabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .in('status', ['active', 'grace', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 4. Fetch price book for Boost plans
  const { data: priceBook } = await adminSupabase
    .from('price_book')
    .select('*')
    .eq('country_code', profile.country_code || 'KE')
    .eq('currency_code', 'KES')
    .in('product_id', ['basic', 'pro', 'enterprise']);

  const planOptions = [
    {
      id: 'basic' as const,
      name: 'Boost Basic',
      priceMinor: priceBook?.find((p) => p.product_id === 'basic')?.amount_minor || 150000,
      features: [
        '10 active published listings',
        '3-day freshness bonus in search',
        '30-day analytics totals',
        'Basic provider badge',
      ],
    },
    {
      id: 'pro' as const,
      name: 'Boost Pro',
      priceMinor: priceBook?.find((p) => p.product_id === 'pro')?.amount_minor || 350000,
      features: [
        '25 active published listings',
        '7-day freshness bonus in search',
        '90-day daily analytics trends',
        'Pro badge styling',
      ],
    },
    {
      id: 'enterprise' as const,
      name: 'Boost Enterprise',
      priceMinor: priceBook?.find((p) => p.product_id === 'enterprise')?.amount_minor || 900000,
      features: [
        '100 active published listings',
        '14-day freshness bonus in search',
        'Full CSV data exports',
        'Dedicated account manager',
      ],
    },
  ];

  // 5. Fetch payment history
  const { data: payments } = await adminSupabase
    .from('payments')
    .select('*')
    .eq('payer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(15);

  // 6. Fetch active promotions (Top Ads)
  const { data: promotions } = await adminSupabase
    .from('listing_promotions')
    .select(`
      id,
      slot_no,
      status,
      period,
      created_at,
      service_packages (
        id,
        title
      )
    `)
    .eq('provider_id', user.id)
    .in('status', ['active', 'held'])
    .order('created_at', { ascending: false });

  const planNameDisplay =
    entitlements.plan_id === 'enterprise'
      ? 'Boost Enterprise'
      : entitlements.plan_id === 'pro'
      ? 'Boost Pro'
      : entitlements.plan_id === 'basic'
      ? 'Boost Basic'
      : 'Free Forever';

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Billing &amp; Boost Capacity
        </h1>
        <p className="text-xs text-text-secondary mt-1">
          Monitor your active listing entitlements, subscription renewals, and M-Pesa receipts.
        </p>
      </div>

      {/* Plan & Entitlements Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Active Subscription */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Current Plan
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  subscription?.status === 'active'
                    ? 'bg-pine-50 text-pine-800 border border-pine-200'
                    : subscription?.status === 'grace'
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-sand-100 text-ink'
                }`}
              >
                {subscription?.status ? subscription.status.toUpperCase() : 'FREE'}
              </span>
            </div>

            <div className="text-xl font-extrabold text-ink">{planNameDisplay}</div>

            <div className="mt-3 text-xs text-text-secondary leading-relaxed">
              {subscription?.current_period_end ? (
                <>
                  Valid through{' '}
                  <strong className="text-ink">
                    {new Date(subscription.current_period_end).toLocaleDateString('en-KE', {
                      dateStyle: 'medium',
                    })}
                  </strong>
                  {subscription.cancel_at_period_end && (
                    <div className="mt-1 text-amber-700 font-medium">
                      Auto-renew is turned off. Benefits expire at period end.
                    </div>
                  )}
                </>
              ) : (
                'You are currently on the Free barter tier. Upgrade for higher listing limits.'
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-xs">
            <span className="text-text-muted">Freshness Bonus</span>
            <span className="font-semibold text-pine-800">
              +{entitlements.rank_bonus_days} Days
            </span>
          </div>
        </div>

        {/* Card 2: Listing Capacity Meter */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Listing Capacity
              </span>
              <Package className="h-4 w-4 text-pine-600" />
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-ink">{activeCount}</span>
              <span className="text-xs text-text-muted">/ {packageLimit} active packages</span>
            </div>

            {/* Progress Bar */}
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border/40">
              <div
                className={`h-full rounded-full transition-all ${
                  percentageUsed >= 100
                    ? 'bg-amber-600'
                    : percentageUsed >= 80
                    ? 'bg-amber-500'
                    : 'bg-pine-600'
                }`}
                style={{ width: `${percentageUsed}%` }}
              />
            </div>

            <p className="mt-3 text-xs text-text-secondary leading-relaxed">
              {percentageUsed >= 100
                ? 'You have reached your active listings cap. Upgrade to publish more packages.'
                : `${packageLimit - activeCount} package slot${packageLimit - activeCount === 1 ? '' : 's'} remaining.`}
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-xs">
            <span className="text-text-muted">Analytics Tier</span>
            <span className="font-semibold text-ink capitalize">
              {entitlements.analytics_level}
            </span>
          </div>
        </div>

        {/* Card 3: Barter Guarantee */}
        <div className="rounded-2xl border border-pine-200 bg-pine-50/40 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 text-pine-800">
              <ShieldCheck className="h-5 w-5 text-pine-700" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Barter Firewall Guarantee
              </span>
            </div>
            <p className="text-xs text-pine-900 leading-relaxed">
              All trades and negotiations on Trade Weft carry <strong>0% transaction fees</strong>.
              Payments only buy capacity and visibility — your barter agreements and reputation
              remain strictly fee-free and tamper-evident.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-pine-200/60">
            <Link
              href="/trust"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-pine-800 hover:text-pine-900"
            >
              Learn how trust ranking works
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Plan Management Action Bar & Modal */}
      <BillingDashboardClient
        currentPlanId={entitlements.plan_id}
        subscriptionId={subscription?.id}
        subscriptionStatus={subscription?.status}
        cancelAtPeriodEnd={subscription?.cancel_at_period_end}
        periodEnd={subscription?.current_period_end}
        plans={planOptions}
        userPhoneDefault=""
      />

      {/* Active Promoted Placements (Top Ads) */}
      {promotions && promotions.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-600" />
            <h2 className="text-base font-bold text-ink">Active Top Ad Promotions</h2>
          </div>

          <div className="divide-y divide-border">
            {promotions.map((promo: any) => {
              const pkg = promo.service_packages;
              return (
                <div key={promo.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-ink">
                      {pkg?.title || 'Service Package'}
                    </span>
                    <span className="text-text-muted ms-2">Slot #{promo.slot_no}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        promo.status === 'active'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-sand-100 text-text-secondary'
                      }`}
                    >
                      {promo.status.toUpperCase()}
                    </span>
                    {pkg && (
                      <Link
                        href={`/packages/${pkg.id}/view`}
                        className="text-pine-700 hover:underline inline-flex items-center gap-1"
                      >
                        View
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment History & Printable Receipts */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-pine-600" />
            <h2 className="text-base font-bold text-ink">Payment History</h2>
          </div>
          <span className="text-xs text-text-muted">Safaricom Daraja Transactions</span>
        </div>

        {!payments || payments.length === 0 ? (
          <div className="py-8 text-center text-xs text-text-muted">
            No payments recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 text-start font-semibold">Date</th>
                  <th className="py-2.5 text-start font-semibold">Product</th>
                  <th className="py-2.5 text-start font-semibold">Amount</th>
                  <th className="py-2.5 text-start font-semibold">M-Pesa Receipt</th>
                  <th className="py-2.5 text-start font-semibold">Status</th>
                  <th className="py-2.5 text-end font-semibold">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-surface-raised/50 transition-colors">
                    <td className="py-3 text-text-secondary">
                      {new Date(pay.created_at).toLocaleDateString('en-KE', {
                        dateStyle: 'medium',
                      })}
                    </td>
                    <td className="py-3 font-semibold text-ink capitalize">
                      {pay.purpose === 'boost_period'
                        ? 'Boost Subscription'
                        : pay.purpose === 'top_ad'
                        ? 'Top Ad Promotion'
                        : pay.purpose}
                    </td>
                    <td className="py-3 font-bold text-ink">
                      {formatMinorMoney(pay.amount_minor, pay.currency_code)}
                    </td>
                    <td className="py-3 font-mono text-[11px] text-text-secondary">
                      {pay.receipt_number || '—'}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          pay.status === 'succeeded'
                            ? 'bg-pine-50 text-pine-800 border border-pine-200'
                            : pay.status === 'pending'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-sand-100 text-text-muted'
                        }`}
                      >
                        {pay.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-end">
                      {pay.status === 'succeeded' && (
                        <Link
                          href={`/dashboard/billing/receipts/${pay.id}`}
                          className="inline-flex items-center gap-1 text-pine-700 hover:text-pine-800 font-semibold"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Receipt
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
