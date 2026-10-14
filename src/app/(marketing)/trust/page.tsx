import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ShieldCheck,
  Scale,
  EyeOff,
  FileCheck,
  Clock,
  Sparkles,
  Award,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'How Trust Works | Proof of Reliability & Public Ledger | Trade Weft',
  description:
    'Learn how Trade Weft calculates tamper-evident barter reputation, enforces double-blind review fairness, and maintains an immutable public trust ledger.',
};

export default function TrustExplainerPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-chip bg-pine-50 border border-pine-200 text-pine-800 text-xs font-semibold mb-4">
          <ShieldCheck className="h-4 w-4 text-pine-600" aria-hidden="true" />
          The Trade Weft Trust Engine
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
          Tamper-Evident Reputation for Cash-Free Barter
        </h1>
        <p className="mt-4 text-base text-text-secondary max-w-2xl mx-auto leading-relaxed">
          When businesses and freelancers exchange services instead of cash, reputation is the
          currency. Here is the transparent mathematics and integrity architecture behind Trade
          Weft&apos;s Proof of Reliability.
        </p>
      </header>

      {/* 4 Pillars of Barter Trust */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <div className="h-10 w-10 rounded-xl bg-pine-50 flex items-center justify-center text-pine-600 mb-4 border border-pine-200">
            <Scale className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-ink">1. Bayesian Mathematical Model</h2>
          <p className="mt-2 text-xs text-text-secondary leading-relaxed">
            Reputation starts with a transparent prior ($C = 80$, weight $m = 5$). As you complete
            contracts, actual verified ratings take over. We smooth extremes so a single difficult
            client cannot erase an otherwise solid track record, while poor performers cannot hide.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <div className="h-10 w-10 rounded-xl bg-pine-50 flex items-center justify-center text-pine-600 mb-4 border border-pine-200">
            <EyeOff className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-ink">2. Double-Blind Reveal</h2>
          <p className="mt-2 text-xs text-text-secondary leading-relaxed">
            Neither party can see the other&apos;s review until both have submitted, or until the
            14-day window expires. This eliminates retaliatory reviews, hostage feedback, and
            hesitation to provide honest constructive evaluations.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <div className="h-10 w-10 rounded-xl bg-pine-50 flex items-center justify-center text-pine-600 mb-4 border border-pine-200">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-ink">3. Three-Partner Threshold</h2>
          <p className="mt-2 text-xs text-text-secondary leading-relaxed">
            To prevent reciprocal collusion between two friends, public reliability scores require
            at least 3 unique counterparties. Providers with fewer partners display progress
            transparently until the threshold is met.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs" id="ledger">
          <div className="h-10 w-10 rounded-xl bg-pine-50 flex items-center justify-center text-pine-600 mb-4 border border-pine-200">
            <FileCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-ink">4. Public Trust Ledger</h2>
          <p className="mt-2 text-xs text-text-secondary leading-relaxed">
            Every accepted contract is hashed (SHA-256) and recorded with a short tamper-evident
            reference. When contracts complete, the verified transaction joins the provider&apos;s
            public ledger with mutual consent, creating an unforgeable commercial resume.
          </p>
        </div>
      </div>

      {/* Deep Dive: Anti-Gaming Safeguards */}
      <section className="rounded-2xl border border-border bg-surface p-8 shadow-xs mb-16 space-y-6">
        <h2 className="text-xl font-bold text-ink flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-pine-600" aria-hidden="true" />
          Engineered Abuse Resistance
        </h2>

        <div className="space-y-4 text-xs text-text-secondary leading-relaxed">
          <div className="flex items-start gap-3">
            <div className="h-5 w-5 rounded-full bg-pine-50 text-pine-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
              ✓
            </div>
            <div>
              <strong className="text-ink font-semibold">Pair Dampening:</strong> Repeating trades
              with the exact same partner carries diminishing weight ($1/k$) in the score formula.
              You cannot game the system by looping 50 small trades with the same counterpart.
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="h-5 w-5 rounded-full bg-pine-50 text-pine-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
              ✓
            </div>
            <div>
              <strong className="text-ink font-semibold">Recency Decay:</strong> Reviews smoothly
              decay with a 12-month half-life (t½ = 365 days). Recent high performance
              matters more than activity from several years ago.
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="h-5 w-5 rounded-full bg-pine-50 text-pine-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
              ✓
            </div>
            <div>
              <strong className="text-ink font-semibold">Dispute Neutrality:</strong> An open or
              unresolved dispute never lowers a provider&apos;s reliability score. Reputation
              penalties only occur if formal moderation establishes bad faith.
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="h-5 w-5 rounded-full bg-pine-50 text-pine-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
              ✓
            </div>
            <div>
              <strong className="text-ink font-semibold">Zero Pay-to-Play:</strong> No premium
              subscription, Top Ad, or promotion can alter, hide, or artificially inflate a
              provider&apos;s score. The Trust Engine is strictly decoupled from advertising.
            </div>
          </div>
        </div>
      </section>

      {/* Review Lifecycle Timeline */}
      <section className="mb-16">
        <h2 className="text-xl font-bold text-ink mb-6 text-center">
          The 14-Day Review Lifecycle
        </h2>

        <div className="relative border-l-2 border-pine-200 ms-4 sm:ms-8 space-y-8 pl-6 sm:pl-8">
          <div>
            <div className="absolute -left-2.5 h-5 w-5 rounded-full bg-pine-600 border-4 border-surface" />
            <h3 className="text-sm font-bold text-ink">Contract Completed</h3>
            <p className="text-xs text-text-secondary mt-1">
              Both parties mark deliverables complete and confirm receipt. The 14-day double-blind
              review window begins immediately.
            </p>
          </div>

          <div>
            <div className="absolute -left-2.5 h-5 w-5 rounded-full bg-pine-400 border-4 border-surface" />
            <h3 className="text-sm font-bold text-ink">1-Hour Edit & Withdrawal Window</h3>
            <p className="text-xs text-text-secondary mt-1">
              After submitting, each reviewer has a 60-minute grace period to fix typos or withdraw
              their review before it can become permanent.
            </p>
          </div>

          <div>
            <div className="absolute -left-2.5 h-5 w-5 rounded-full bg-pine-500 border-4 border-surface" />
            <h3 className="text-sm font-bold text-ink">Day 7 Notification Reminder</h3>
            <p className="text-xs text-text-secondary mt-1">
              If either party hasn&apos;t reviewed yet, an in-app reminder is dispatched at the
              midway point.
            </p>
          </div>

          <div>
            <div className="absolute -left-2.5 h-5 w-5 rounded-full bg-pine-700 border-4 border-surface" />
            <h3 className="text-sm font-bold text-ink">Simultaneous Reveal & Score Update</h3>
            <p className="text-xs text-text-secondary mt-1">
              The moment the second review arrives, or on Day 14 at midnight UTC, submitted reviews
              reveal simultaneously. Reputation scores update atomically.
            </p>
          </div>
        </div>
      </section>

      {/* Phase 5: Portfolio Verification & Proof of Work */}
      <section className="rounded-2xl border border-border bg-surface p-8 shadow-xs mb-16 space-y-6" id="verification">
        <div className="flex items-center gap-2">
          <Award className="h-6 w-6 text-pine-600" aria-hidden="true" />
          <h2 className="text-xl font-bold text-ink">
            Portfolio Verification: Day-1 Proof of Work
          </h2>
        </div>

        <p className="text-xs text-text-secondary leading-relaxed">
          Before completing your first barter trade, how do counter-parties know you are an established
          professional? Trade Weft provides cryptographic and human-verified ownership proofs for your
          external portfolio links.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="rounded-xl border border-sand-200 bg-sand-50 p-4 space-y-2">
            <h3 className="text-sm font-bold text-ink">Standalone OAuth</h3>
            <p className="text-xs text-text-muted leading-relaxed">
              GitHub accounts are verified via dedicated OAuth with PKCE. Accounts must be at least 30
              days old. Access tokens are immediately discarded and never stored.
            </p>
          </div>

          <div className="rounded-xl border border-sand-200 bg-sand-50 p-4 space-y-2">
            <h3 className="text-sm font-bold text-ink">Domain Proof</h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Personal websites are verified by placing an HTML &lt;meta&gt; tag or a file in
              /.well-known/. Our fetcher validates connections with strict SSRF and DNS rebinding protections.
            </p>
          </div>

          <div className="rounded-xl border border-sand-200 bg-sand-50 p-4 space-y-2">
            <h3 className="text-sm font-bold text-ink">Manual Review</h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Design and social platforms (Figma, Behance, LinkedIn, etc.) are verified by placing a
              unique challenge code in your bio or public post, reviewed by human verifiers within a 48-hour SLA.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-pine-200 bg-pine-50/50 p-4 text-xs text-pine-900 leading-relaxed">
          <span className="font-bold">Earned, Never Bought:</span> Portfolio verification cannot be purchased,
          boosted, or sponsored. Verification confirms technical ownership of your public body of work. It is
          strictly decoupled from your Proof of Reliability barter score.
        </div>
      </section>

      {/* Phase 6: How Ranking & Paid Placements Work */}
      <section className="rounded-2xl border border-border bg-surface p-8 shadow-xs mb-16 space-y-6" id="monetization">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-pine-600" aria-hidden="true" />
          <h2 className="text-xl font-bold text-ink">
            How Ranking &amp; Paid Placements Work
          </h2>
        </div>

        <p className="text-xs text-text-secondary leading-relaxed">
          Trade Weft is funded through optional visibility, listing capacity, and analytics tools — never through
          fees on barter transactions. We maintain a strict, cryptographically and architecturally enforced firewall
          between paid features and our trust signals.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="rounded-xl border border-border bg-surface-raised p-5 space-y-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-700 border border-amber-500/20">
              <Sparkles className="h-3 w-3" />
              Promoted Placements (Top Ads)
            </div>
            <h3 className="text-sm font-bold text-ink">Pinned Category &amp; City Slots</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Providers can promote a service package into one of at most 3 pinned slots for a specific
              city and category. These always appear on page 1 of search with an amber &ldquo;Promoted&rdquo; badge.
              Database exclusion constraints prevent overbooking, and slots automatically expire when their period ends.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface-raised p-5 space-y-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-pine-50 text-pine-700 border border-pine-200">
              <TrendingUp className="h-3 w-3" />
              Boost Packages (Freshness Bonus)
            </div>
            <h3 className="text-sm font-bold text-ink">Bounded Organic Discovery</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Subscribers to Boost plans receive bounded freshness ranking bonuses when buyers browse categories.
              Crucially, when a user enters search keywords, text relevance strictly dictates the order; Boost
              only serves as a secondary tie-breaker among packages with matching relevance.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-50/30 p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
            The Non-Negotiable Firewall: What Money Can NEVER Buy
          </h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-amber-950">
            <li className="flex items-center gap-2">
              <span className="text-amber-600 font-bold">✕</span> No altered or removed reviews
            </li>
            <li className="flex items-center gap-2">
              <span className="text-amber-600 font-bold">✕</span> No inflated Proof of Reliability scores
            </li>
            <li className="flex items-center gap-2">
              <span className="text-amber-600 font-bold">✕</span> No purchased &ldquo;Verified&rdquo; portfolio badges
            </li>
            <li className="flex items-center gap-2">
              <span className="text-amber-600 font-bold">✕</span> No sponsored influence in Mutual Matches
            </li>
          </ul>
        </div>
      </section>

      {/* Call to Action */}
      <div className="text-center rounded-2xl bg-pine-50 border border-pine-200 p-8 sm:p-10">
        <h2 className="text-xl font-bold text-pine-900">
          Ready to build your barter reputation?
        </h2>
        <p className="text-xs text-pine-800 mt-2 max-w-md mx-auto">
          Explore services in Nairobi, propose a trade, and establish your verified track record.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/explore"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-pine-600 text-white text-xs font-semibold hover:bg-pine-700 transition-colors shadow-xs"
          >
            Explore Services
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
