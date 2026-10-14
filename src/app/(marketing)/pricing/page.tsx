import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import {
  Check,
  Sparkles,
  Zap,
  TrendingUp,
  ShieldCheck,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';
import { formatMinorMoney } from '@/features/payments/utils/money';

export const metadata: Metadata = {
  title: 'Pricing & Boost Plans | Trade Weft',
  description:
    'Cash-free barter is always 100% free. Explore Boost packages for expanded listing limits, freshness bonuses, and business analytics in Kenya.',
};

interface PlanCardProps {
  id: string;
  name: string;
  description: string;
  priceFormatted: string;
  cycle: string;
  isPopular?: boolean;
  features: string[];
  ctaText: string;
  ctaHref: string;
}

export default async function PricingPage() {
  const supabase = await createClient();

  // Fetch plans and active price book entries for Kenya
  const [{ data: plans }, { data: prices }] = await Promise.all([
    supabase.from('plans').select('*').order('created_at', { ascending: true }),
    supabase
      .from('price_book')
      .select('*')
      .eq('country_code', 'KE')
      .eq('currency_code', 'KES'),
  ]);

  const priceMap = new Map<string, number>();
  (prices || []).forEach((p) => {
    priceMap.set(p.product_id, p.amount_minor);
  });

  const getPriceDisplay = (planId: string) => {
    const minor = priceMap.get(planId);
    if (!minor) {
      if (planId === 'basic') return 'KES 1,000';
      if (planId === 'pro') return 'KES 2,500';
      if (planId === 'enterprise') return 'KES 5,000';
      return 'Free';
    }
    return formatMinorMoney(minor, 'KES');
  };

  const planCards: PlanCardProps[] = [
    {
      id: 'free',
      name: 'Free Forever',
      description: 'The complete core barter toolkit for freelancers and small businesses.',
      priceFormatted: 'KES 0',
      cycle: 'Forever',
      features: [
        '3 active published service packages',
        'Standard organic discovery',
        'Unlimited cash-free barter agreements',
        'Double-blind reviews & Public Trust Ledger',
        '0% platform commission on all trades',
        'In-app messaging & trade notifications',
      ],
      ctaText: 'Start Trading Free',
      ctaHref: '/dashboard',
    },
    {
      id: 'basic',
      name: 'Boost Basic',
      description: 'Expanded capacity for active specialists trading across multiple services.',
      priceFormatted: getPriceDisplay('basic'),
      cycle: 'per 30 days',
      features: [
        '15 active published service packages',
        '3-day freshness bonus in organic browse',
        '30-day analytics totals (impressions & views)',
        'Basic Provider badge',
        '0% platform commission on trades',
        'Email & in-app support',
      ],
      ctaText: 'Get Basic',
      ctaHref: '/dashboard/billing',
    },
    {
      id: 'pro',
      name: 'Boost Pro',
      description: 'Ideal for established agencies and studios scaling their barter pipeline.',
      priceFormatted: getPriceDisplay('pro'),
      cycle: 'per 30 days',
      isPopular: true,
      features: [
        '25 active published service packages',
        '7-day freshness bonus in organic browse',
        '90-day daily analytics trends & funnel data',
        'Pro Verified badge styling',
        'Priority counter-party matching',
        'Fast-track portfolio link review',
      ],
      ctaText: 'Upgrade to Pro',
      ctaHref: '/dashboard/billing',
    },
    {
      id: 'enterprise',
      name: 'Boost Enterprise',
      description: 'Maximum listing capacity and deep commercial intelligence for top organizations.',
      priceFormatted: getPriceDisplay('enterprise'),
      cycle: 'per 30 days',
      features: [
        '50 active published service packages',
        '14-day freshness bonus in organic browse',
        'Comprehensive analytics with CSV export',
        'Enterprise badge on public profile',
        'Dedicated onboarding & match concierge',
        'Custom invoicing & phone support',
      ],
      ctaText: 'Choose Enterprise',
      ctaHref: '/dashboard/billing',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-chip bg-pine-50 border border-pine-200 text-pine-800 text-xs font-semibold mb-4">
          <Zap className="h-4 w-4 text-pine-600" />
          Transparent B2B Monetization
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
          The Barter Core Stays Free. Upgrade for Scale.
        </h1>
        <p className="mt-4 text-sm sm:text-base text-text-secondary leading-relaxed">
          Trade Weft never charges commissions or per-trade fees. All barter agreements are free.
          Paid Boost packages sell listing capacity, category freshness, and analytics insights.
        </p>
      </div>

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        {planCards.map((plan) => (
          <div
            key={plan.id}
            className={`relative flex flex-col justify-between rounded-2xl border p-6 shadow-xs transition-shadow hover:shadow-md ${
              plan.isPopular
                ? 'border-pine-500 bg-surface ring-2 ring-pine-500/20'
                : 'border-border bg-surface'
            }`}
          >
            {plan.isPopular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-pine-600 px-3 py-0.5 text-[11px] font-bold text-white shadow-xs">
                Most Popular
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-ink">{plan.name}</h2>
              </div>
              <p className="mt-2 text-xs text-text-secondary leading-relaxed min-h-[36px]">
                {plan.description}
              </p>

              <div className="mt-6 mb-6">
                <span className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
                  {plan.priceFormatted}
                </span>
                <span className="text-xs text-text-muted ms-2">/ {plan.cycle}</span>
              </div>

              <div className="border-t border-border pt-4">
                <div className="text-xs font-semibold text-ink uppercase tracking-wider mb-3">
                  Included:
                </div>
                <ul className="space-y-2.5">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-text-secondary">
                      <div className="h-4 w-4 rounded-full bg-pine-50 text-pine-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5 border border-pine-200">
                        <Check className="h-2.5 w-2.5" />
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-border">
              <Link
                href={plan.ctaHref}
                className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors ${
                  plan.isPopular
                    ? 'bg-pine-600 text-white hover:bg-pine-700 shadow-xs'
                    : 'bg-surface-raised border border-border text-ink hover:bg-border/30'
                }`}
              >
                {plan.ctaText}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Top Ads Callout Banner */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-50/30 p-8 mb-16 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
              <Sparkles className="h-3.5 w-3.5" />
              Need Immediate Category Prominence?
            </div>
            <h3 className="text-lg font-bold text-ink">
              Top Ads: Pinned Page-1 Placement
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Promote individual listings to the top of your city and category for 7, 14, or 30 days.
              Only 3 slots are available per category/city to prevent ad flood. Guaranteed visibility
              with zero influence on your underlying barter reputation.
            </p>
          </div>
          <Link
            href="/dashboard/packages"
            className="inline-flex items-center gap-2 rounded-lg bg-surface border border-border px-5 py-2.5 text-xs font-semibold text-ink hover:bg-sand-50 transition-colors shadow-xs flex-shrink-0"
          >
            Promote a Package
            <ArrowRight className="h-4 w-4 text-pine-600" />
          </Link>
        </div>
      </div>

      {/* Trust & Transparency FAQ */}
      <div className="rounded-2xl border border-border bg-surface p-8 shadow-xs">
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck className="h-5 w-5 text-pine-600" />
          <h3 className="text-base font-bold text-ink">
            Monetization &amp; Trust FAQ
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed text-text-secondary">
          <div className="space-y-1.5">
            <h4 className="font-bold text-ink">Can money improve my Proof of Reliability score?</h4>
            <p>
              Absolutely not. Reputation scores are calculated exclusively from verified, completed
              trades and double-blind reviews. Money cannot buy, alter, or remove reviews.
            </p>
          </div>

          <div className="space-y-1.5">
            <h4 className="font-bold text-ink">How do Safaricom M-Pesa payments work?</h4>
            <p>
              When upgrading or purchasing Top Ads, you enter your Safaricom phone number. A secure
              STK Push PIN prompt appears instantly on your handset. You confirm with your M-Pesa PIN.
            </p>
          </div>

          <div className="space-y-1.5">
            <h4 className="font-bold text-ink">Are there any fees when I agree to a trade?</h4>
            <p>
              None. Barter transactions are 100% free of platform charges or commissions. You trade
              pure value with your counterpart.
            </p>
          </div>

          <div className="space-y-1.5">
            <h4 className="font-bold text-ink">Can I cancel my Boost subscription anytime?</h4>
            <p>
              Yes. You can disable renewal at any time from your Billing Dashboard. Your plan benefits
              remain active until the end of your prepaid 30-day window.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
