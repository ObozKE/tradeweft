import React from 'react';
import type { Metadata } from 'next';
import { requireFinanceOrAdmin } from '@/server/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatMinorMoney } from '@/features/payments/utils/money';
import {
  TrendingUp,
  DollarSign,
  Sparkles,
  Users,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Revenue & MRR Analytics | Admin | Trade Weft',
  description: 'Executive revenue metrics, Boost MRR, Top Ad revenue, and payment health across Kenya.',
};

export default async function AdminRevenuePage() {
  const { user } = await requireFinanceOrAdmin();
  const adminSupabase = createAdminClient();

  // Call get_revenue_metrics RPC
  const { data: metricsRaw, error } = await adminSupabase.rpc('get_revenue_metrics', {
    p_actor_id: user.id,
  });

  const metrics = (metricsRaw as any) || {
    total_revenue_minor: 0,
    boost_mrr_minor: 0,
    top_ad_revenue_minor: 0,
    active_subscribers: 0,
    active_promotions: 0,
    failed_payments: 0,
  };

  const totalRevenueMinor = Number(metrics.total_revenue_minor || 0);
  const boostMrrMinor = Number(metrics.boost_mrr_minor || 0);
  const topAdRevenueMinor = Number(metrics.top_ad_revenue_minor || 0);
  const activeSubscribers = Number(metrics.active_subscribers || 0);
  const activePromotions = Number(metrics.active_promotions || 0);
  const failedPayments = Number(metrics.failed_payments || 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Commercial Revenue Analytics</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Real-time gross transaction volumes, recurring Boost MRR, and platform health.
        </p>
      </div>

      {/* Top Level Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <div className="flex items-center justify-between text-text-muted text-xs mb-2">
            <span className="font-semibold uppercase tracking-wider">Gross Settled Revenue</span>
            <TrendingUp className="h-4 w-4 text-pine-600" />
          </div>
          <div className="text-3xl font-extrabold text-ink tracking-tight">
            {formatMinorMoney(totalRevenueMinor, 'KES')}
          </div>
          <div className="text-xs text-text-muted mt-2">
            All-time completed payments via M-Pesa
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <div className="flex items-center justify-between text-text-muted text-xs mb-2">
            <span className="font-semibold uppercase tracking-wider">Boost MRR</span>
            <Sparkles className="h-4 w-4 text-pine-600" />
          </div>
          <div className="text-3xl font-extrabold text-pine-900 tracking-tight">
            {formatMinorMoney(boostMrrMinor, 'KES')}
          </div>
          <div className="text-xs text-text-muted mt-2">
            Current active 30-day subscriptions run-rate
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <div className="flex items-center justify-between text-text-muted text-xs mb-2">
            <span className="font-semibold uppercase tracking-wider">Top Ad Revenue</span>
            <TrendingUp className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-3xl font-extrabold text-ink tracking-tight">
            {formatMinorMoney(topAdRevenueMinor, 'KES')}
          </div>
          <div className="text-xs text-text-muted mt-2">
            Pinned category placement proceeds
          </div>
        </div>
      </div>

      {/* Operational Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-muted font-semibold">Active Boost Subscribers</div>
            <div className="text-2xl font-extrabold text-ink mt-1">{activeSubscribers}</div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-pine-50 border border-pine-200 flex items-center justify-center text-pine-700">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-muted font-semibold">Active Promoted Listings</div>
            <div className="text-2xl font-extrabold text-ink mt-1">{activePromotions}</div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-muted font-semibold">Failed or Cancelled Prompts</div>
            <div className="text-2xl font-extrabold text-ink mt-1">{failedPayments}</div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-sand-100 border border-sand-200 flex items-center justify-center text-text-secondary">
            <ShieldAlert className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Zero Fee Integrity Guarantee Note */}
      <div className="rounded-2xl border border-pine-200 bg-pine-50/50 p-6 shadow-xs flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-white border border-pine-200 flex items-center justify-center text-pine-700 flex-shrink-0">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="space-y-1 text-xs leading-relaxed text-pine-950">
          <h3 className="font-bold text-sm text-pine-900">
            Strict Separation of Monetization and Barter Integrity
          </h3>
          <p>
            Trade Weft collects exactly <strong>0% transaction fees</strong> on barter trades between
            businesses. All revenue reflected above is derived from optional visibility products
            (Top Ads) and listing capacity plans (Boost). Platform revenue never flows into or influences
            reputation scoring, verification status, or trust ledger records.
          </p>
        </div>
      </div>
    </div>
  );
}
