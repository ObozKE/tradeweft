import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Scale,
  RefreshCw,
  CheckCircle2,
  Lock,
  Layers,
  MapPin,
  ChevronDown,
  Sparkles,
  Users,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Trade Weft | B2B Service Barter Marketplace for Nairobi & Africa',
  description:
    'Trade your professional services without cash. Nairobi businesses and freelancers exchange web development, legal, accounting, branding, and corporate services on a verified public trust ledger.',
};

export default function HomePage() {
  return (
    <div className="space-y-24 pb-20">
      {/* 1. Full-Bleed Hero Section with Nairobi Skyline Background */}
      <section className="relative w-full overflow-hidden bg-pine-950 px-4 py-20 sm:px-6 sm:py-28 lg:py-32 border-b border-pine-900 shadow-md">
        {/* Background Image with Next.js Image covering 100% of the space */}
        <Image
          src="/images/hero-bg.jpg"
          alt="Nairobi commercial skyline and lush urban canopy in Upper Hill"
          fill
          priority
          quality={90}
          sizes="100vw"
          className="object-cover object-center"
        />

        {/* Dark Pine Scrim for contrast & brand alignment */}
        <div className="absolute inset-0 bg-gradient-to-b from-pine-950/85 via-pine-950/80 to-pine-950/92" />

        {/* Subtle woven grid overlay (from DESIGN.md section 1.3) */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#8ACFC5 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Hero Content on top of background */}
        <div className="relative z-10 mx-auto max-w-4xl text-center space-y-8">
          <div className="inline-flex items-center gap-2 rounded-chip bg-pine-900/85 border border-pine-700/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-pine-200 backdrop-blur-sm shadow-xs">
            <span>Nairobi Launch Edition</span>
            <span className="text-pine-400">•</span>
            <span>Zero Cash Required</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-medium tracking-tight text-white leading-[1.1]">
            Trade your professional services.{' '}
            <span className="text-pine-300 block mt-2">Keep your working capital.</span>
          </h1>

          <p className="mx-auto max-w-3xl text-lg sm:text-xl text-pine-100/90 leading-relaxed font-normal">
            The B2B service barter marketplace for Nairobi agencies, founders, and independent
            consultants. Trade web development for tax filing, or brand identity for corporate legal
            contracts—backed by structured milestones and an immutable trust ledger.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/explore">
              <Button size="lg" variant="primary" className="gap-2 text-base px-8 h-13 bg-pine-600 hover:bg-pine-500 shadow-sm">
                <span>Explore Marketplace</span>
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="lg" variant="outline" className="text-base px-8 h-13 border-pine-600 text-white hover:bg-white/10 backdrop-blur-xs">
                List Your Services Free
              </Button>
            </Link>
          </div>

          {/* Hero Value Guarantees (Glass Cards) */}
          <div className="pt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto text-left">
            <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-md shadow-xs">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-chip bg-pine-400/20 text-pine-200 border border-pine-400/30">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">100% Cash-Free Trading</p>
                <p className="text-[11px] text-pine-200/80">No commissions on bilateral trades</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-md shadow-xs">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-chip bg-pine-400/20 text-pine-200 border border-pine-400/30">
                <Scale className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Bilateral Scope Agreements</p>
                <p className="text-[11px] text-pine-200/80">Milestone protection on every trade</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-md shadow-xs">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-chip bg-pine-400/20 text-pine-200 border border-pine-400/30">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Proof of Reliability</p>
                <p className="text-[11px] text-pine-200/80">Double-blind review trust ledger</p>
              </div>
            </div>
          </div>

          {/* Nairobi Neighborhoods ticker banner */}
          <div className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-pine-300/80 mb-2.5">
              Active in Nairobi Neighborhoods & Remote Nationwide
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {['Kilimani', 'Westlands', 'Upper Hill', 'CBD', 'Karen', 'Lavington', 'Industrial Area', 'Remote (Kenya)'].map((loc) => (
                <span
                  key={loc}
                  className="inline-flex items-center gap-1.5 rounded-chip border border-white/15 bg-white/10 px-3 py-1 font-medium text-white/90 backdrop-blur-xs"
                >
                  <MapPin className="h-3 w-3 text-pine-300" aria-hidden="true" />
                  {loc}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 2. How Barter Works (4-Step Linear Flow) */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center space-y-3 mb-12">
          <div className="inline-flex items-center rounded-chip bg-pine-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-pine-800">
            How It Works
          </div>
          <h2 className="text-3xl sm:text-4xl font-medium tracking-tight text-ink">
            Bilateral Exchange with Milestone Certainty
          </h2>
          <p className="mx-auto max-w-2xl text-base text-text-secondary">
            Trading services without cash shouldn&apos;t mean ambiguity. Our structured 4-step framework
            aligns scopes, synchronizes execution, and seals credibility on the public ledger.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Step 1 */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-chip bg-pine-100 text-pine-800 font-bold text-sm">
                  01
                </span>
                <span className="rounded-chip bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-text-muted">
                  Package
                </span>
              </div>
              <h3 className="text-lg font-semibold text-ink">Package Your Capability</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Define what you offer as a discrete deliverable. Specify turnaround days, delivery
                mode (In-Person or Remote), and what complementary services your business is seeking
                in return.
              </p>
            </div>
            <div className="pt-2 border-t border-border/60 text-[11px] text-pine-800 font-medium">
              Turn spare agency hours into assets
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-chip bg-pine-100 text-pine-800 font-bold text-sm">
                  02
                </span>
                <span className="rounded-chip bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-text-muted">
                  Proposal
                </span>
              </div>
              <h3 className="text-lg font-semibold text-ink">Propose & Scope Trade</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Find a provider whose services you need. Send a trade proposal with reciprocal
                deliverables. Both sides refine milestones until the mutual scope is evenly balanced
                and agreed.
              </p>
            </div>
            <div className="pt-2 border-t border-border/60 text-[11px] text-pine-800 font-medium">
              Transparent indicative valuations
            </div>
          </div>

          {/* Step 3 */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-chip bg-pine-100 text-pine-800 font-bold text-sm">
                  03
                </span>
                <span className="rounded-chip bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-text-muted">
                  Execution
                </span>
              </div>
              <h3 className="text-lg font-semibold text-ink">Deliver by Milestones</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Execute work concurrently according to your bilateral timeline. Progress milestones
                and sign-offs protect both parties so neither business is left delivering alone.
              </p>
            </div>
            <div className="pt-2 border-t border-border/60 text-[11px] text-pine-800 font-medium">
              Synchronized mutual delivery
            </div>
          </div>

          {/* Step 4 */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-chip bg-pine-100 text-pine-800 font-bold text-sm">
                  04
                </span>
                <span className="rounded-chip bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-text-muted">
                  Ledger
                </span>
              </div>
              <h3 className="text-lg font-semibold text-ink">Double-Blind Trust Seal</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Both parties submit reviews independently. Feedback remains hidden until both submit
                or 14 days lapse. Ratings update your Proof of Reliability on the immutable ledger.
              </p>
            </div>
            <div className="pt-2 border-t border-border/60 text-[11px] text-pine-800 font-medium">
              Zero retaliatory or hostage reviews
            </div>
          </div>
        </div>
      </section>

      {/* 3. Popular Service Barter Categories */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-chip bg-pine-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-pine-800">
              Capabilities Directory
            </div>
            <h2 className="text-3xl sm:text-4xl font-medium tracking-tight text-ink">
              Essential Services Ready to Barter
            </h2>
            <p className="text-base text-text-secondary max-w-xl">
              From engineering to accounting, discover professional capabilities offered by verified
              Nairobi service providers.
            </p>
          </div>
          <Link href="/explore">
            <Button variant="outline" size="md" className="gap-2">
              <span>View All Packages</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Category 1 */}
          <Link
            href="/explore?category=web-software"
            className="group relative overflow-hidden rounded-2xl border border-pine-800/60 bg-pine-950 p-6 shadow-sm hover:border-pine-400 hover:shadow-lg transition-all flex flex-col justify-between min-h-[300px]"
          >
            <Image
              src="/images/categories/web-software.jpg"
              alt="Web & Software Engineering"
              fill
              className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-pine-950 via-pine-950/80 to-pine-950/50" />
            <div className="relative z-10 flex items-center justify-between">
              <span className="inline-flex items-center rounded-chip bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-xs">
                Engineering
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-chip bg-white/10 text-white backdrop-blur-xs border border-white/20 group-hover:bg-pine-600 group-hover:border-pine-500 transition-colors">
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <div className="relative z-10 space-y-2.5 pt-12">
              <h3 className="text-xl font-semibold text-white group-hover:text-pine-200 transition-colors">
                Web & Software Engineering
              </h3>
              <p className="text-xs text-pine-100/85 leading-relaxed">
                Frontend web apps, mobile applications, API architectures, and technical audits for
                startups and expanding SMEs.
              </p>
              <div className="pt-2.5 border-t border-white/15 text-[11px] text-pine-200">
                Frequently traded for: <span className="text-white font-medium">Legal contracts, Office branding</span>
              </div>
            </div>
          </Link>

          {/* Category 2 */}
          <Link
            href="/explore?category=design-branding"
            className="group relative overflow-hidden rounded-2xl border border-pine-800/60 bg-pine-950 p-6 shadow-sm hover:border-pine-400 hover:shadow-lg transition-all flex flex-col justify-between min-h-[300px]"
          >
            <Image
              src="/images/categories/design-branding.jpg"
              alt="Design & Brand Identity"
              fill
              className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-pine-950 via-pine-950/80 to-pine-950/50" />
            <div className="relative z-10 flex items-center justify-between">
              <span className="inline-flex items-center rounded-chip bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-xs">
                Creative & Branding
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-chip bg-white/10 text-white backdrop-blur-xs border border-white/20 group-hover:bg-pine-600 group-hover:border-pine-500 transition-colors">
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <div className="relative z-10 space-y-2.5 pt-12">
              <h3 className="text-xl font-semibold text-white group-hover:text-pine-200 transition-colors">
                Design & Brand Identity
              </h3>
              <p className="text-xs text-pine-100/85 leading-relaxed">
                Vector logo systems, comprehensive brand guidelines, UI/UX prototyping, and packaging
                graphics.
              </p>
              <div className="pt-2.5 border-t border-white/15 text-[11px] text-pine-200">
                Frequently traded for: <span className="text-white font-medium">KRA tax filings, Cloud infrastructure</span>
              </div>
            </div>
          </Link>

          {/* Category 3 */}
          <Link
            href="/explore?category=accounting-finance"
            className="group relative overflow-hidden rounded-2xl border border-pine-800/60 bg-pine-950 p-6 shadow-sm hover:border-pine-400 hover:shadow-lg transition-all flex flex-col justify-between min-h-[300px]"
          >
            <Image
              src="/images/categories/accounting-finance.jpg"
              alt="Accounting & Tax Advisory"
              fill
              className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-pine-950 via-pine-950/80 to-pine-950/50" />
            <div className="relative z-10 flex items-center justify-between">
              <span className="inline-flex items-center rounded-chip bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-xs">
                Finance & Tax
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-chip bg-white/10 text-white backdrop-blur-xs border border-white/20 group-hover:bg-pine-600 group-hover:border-pine-500 transition-colors">
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <div className="relative z-10 space-y-2.5 pt-12">
              <h3 className="text-xl font-semibold text-white group-hover:text-pine-200 transition-colors">
                Accounting & Tax Advisory
              </h3>
              <p className="text-xs text-pine-100/85 leading-relaxed">
                Monthly bookkeeping, KRA iTax statutory filings, balance sheet reconciliation, and
                payroll administration.
              </p>
              <div className="pt-2.5 border-t border-white/15 text-[11px] text-pine-200">
                Frequently traded for: <span className="text-white font-medium">Custom software, Studio photography</span>
              </div>
            </div>
          </Link>

          {/* Category 4 */}
          <Link
            href="/explore?category=legal-services"
            className="group relative overflow-hidden rounded-2xl border border-pine-800/60 bg-pine-950 p-6 shadow-sm hover:border-pine-400 hover:shadow-lg transition-all flex flex-col justify-between min-h-[300px]"
          >
            <Image
              src="/images/categories/legal-services.jpg"
              alt="Legal & Corporate Compliance"
              fill
              className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-pine-950 via-pine-950/80 to-pine-950/50" />
            <div className="relative z-10 flex items-center justify-between">
              <span className="inline-flex items-center rounded-chip bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-xs">
                Legal & Compliance
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-chip bg-white/10 text-white backdrop-blur-xs border border-white/20 group-hover:bg-pine-600 group-hover:border-pine-500 transition-colors">
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <div className="relative z-10 space-y-2.5 pt-12">
              <h3 className="text-xl font-semibold text-white group-hover:text-pine-200 transition-colors">
                Legal & Corporate Compliance
              </h3>
              <p className="text-xs text-pine-100/85 leading-relaxed">
                Client service agreements, mutual NDAs, IP assignment agreements, and Kenya Data
                Protection Act 2019 compliance.
              </p>
              <div className="pt-2.5 border-t border-white/15 text-[11px] text-pine-200">
                Frequently traded for: <span className="text-white font-medium">Digital marketing, IT systems setup</span>
              </div>
            </div>
          </Link>

          {/* Category 5 */}
          <Link
            href="/explore?category=marketing-social-media"
            className="group relative overflow-hidden rounded-2xl border border-pine-800/60 bg-pine-950 p-6 shadow-sm hover:border-pine-400 hover:shadow-lg transition-all flex flex-col justify-between min-h-[300px]"
          >
            <Image
              src="/images/categories/marketing-growth.jpg"
              alt="Marketing & Growth Strategy"
              fill
              className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-pine-950 via-pine-950/80 to-pine-950/50" />
            <div className="relative z-10 flex items-center justify-between">
              <span className="inline-flex items-center rounded-chip bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-xs">
                Growth & Marketing
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-chip bg-white/10 text-white backdrop-blur-xs border border-white/20 group-hover:bg-pine-600 group-hover:border-pine-500 transition-colors">
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <div className="relative z-10 space-y-2.5 pt-12">
              <h3 className="text-xl font-semibold text-white group-hover:text-pine-200 transition-colors">
                Marketing & Growth Strategy
              </h3>
              <p className="text-xs text-pine-100/85 leading-relaxed">
                Technical SEO audits, search engine marketing, social media campaigns, and conversion
                funnel copywriting.
              </p>
              <div className="pt-2.5 border-t border-white/15 text-[11px] text-pine-200">
                Frequently traded for: <span className="text-white font-medium">Video production, Physical therapy</span>
              </div>
            </div>
          </Link>

          {/* Category 6 */}
          <Link
            href="/explore?category=photo-video"
            className="group relative overflow-hidden rounded-2xl border border-pine-800/60 bg-pine-950 p-6 shadow-sm hover:border-pine-400 hover:shadow-lg transition-all flex flex-col justify-between min-h-[300px]"
          >
            <Image
              src="/images/categories/photo-video.jpg"
              alt="Commercial Photography & Video"
              fill
              className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-pine-950 via-pine-950/80 to-pine-950/50" />
            <div className="relative z-10 flex items-center justify-between">
              <span className="inline-flex items-center rounded-chip bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-xs">
                Media Production
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-chip bg-white/10 text-white backdrop-blur-xs border border-white/20 group-hover:bg-pine-600 group-hover:border-pine-500 transition-colors">
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <div className="relative z-10 space-y-2.5 pt-12">
              <h3 className="text-xl font-semibold text-white group-hover:text-pine-200 transition-colors">
                Commercial Photography & Video
              </h3>
              <p className="text-xs text-pine-100/85 leading-relaxed">
                Commercial product imagery, corporate headshots, customer case study reels, and event
                documentaries in Nairobi.
              </p>
              <div className="pt-2.5 border-t border-white/15 text-[11px] text-pine-200">
                Frequently traded for: <span className="text-white font-medium">Financial planning, Legal contracts</span>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* 4. Real-World Nairobi Trade Scenarios */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center space-y-3 mb-12">
          <div className="inline-flex items-center rounded-chip bg-pine-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-pine-800">
            Real Barter Scenarios
          </div>
          <h2 className="text-3xl sm:text-4xl font-medium tracking-tight text-ink">
            What Does a High-Value Service Barter Look Like?
          </h2>
          <p className="mx-auto max-w-2xl text-base text-text-secondary">
            Here is how Nairobi founders and agencies preserve tens of thousands of shillings in
            liquidity by trading skills of equivalent value.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Scenario 1 */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-5">
            <div className="inline-flex items-center gap-1.5 rounded-chip bg-pine-50 border border-pine-200 px-2.5 py-0.5 text-[11px] font-semibold text-pine-800">
              Tech Agency ⇄ Accounting Firm
            </div>
            <div className="space-y-4">
              <div className="rounded-xl bg-surface-sunken p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-pine-800">
                  Party A Offers
                </span>
                <p className="text-xs font-semibold text-ink">Custom Next.js Web Portal</p>
                <p className="text-[11px] text-text-secondary">
                  Client onboarding forms, mobile-responsive UI, and Supabase database integration.
                </p>
              </div>

              <div className="flex items-center justify-center">
                <div className="h-7 w-7 rounded-chip bg-pine-100 flex items-center justify-center text-primary">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
              </div>

              <div className="rounded-xl bg-surface-sunken p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-pine-800">
                  Party B Offers
                </span>
                <p className="text-xs font-semibold text-ink">6 Months Bookkeeping & Tax</p>
                <p className="text-[11px] text-text-secondary">
                  Monthly reconciliation, KRA VAT filing, and annual end-of-year financial audit.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-pine-50 border border-pine-200/80 p-3 text-center">
              <p className="text-xs font-semibold text-pine-800">Equal Bilateral Value</p>
              <p className="text-[11px] text-text-secondary">Cash spent: KES 0 • Working capital preserved</p>
            </div>
          </div>

          {/* Scenario 2 */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-5">
            <div className="inline-flex items-center gap-1.5 rounded-chip bg-pine-50 border border-pine-200 px-2.5 py-0.5 text-[11px] font-semibold text-pine-800">
              Corporate Advocate ⇄ Design Studio
            </div>
            <div className="space-y-4">
              <div className="rounded-xl bg-surface-sunken p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-pine-800">
                  Party A Offers
                </span>
                <p className="text-xs font-semibold text-ink">Commercial Contract Suite</p>
                <p className="text-[11px] text-text-secondary">
                  Bespoke master service agreement, contractor NDAs, and trademark registration.
                </p>
              </div>

              <div className="flex items-center justify-center">
                <div className="h-7 w-7 rounded-chip bg-pine-100 flex items-center justify-center text-primary">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
              </div>

              <div className="rounded-xl bg-surface-sunken p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-pine-800">
                  Party B Offers
                </span>
                <p className="text-xs font-semibold text-ink">Corporate Brand Identity</p>
                <p className="text-[11px] text-text-secondary">
                  Complete brand book, typography, stationery system, and presentation decks.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-pine-50 border border-pine-200/80 p-3 text-center">
              <p className="text-xs font-semibold text-pine-800">Equal Bilateral Value</p>
              <p className="text-[11px] text-text-secondary">Cash spent: KES 0 • Legal IP locked down</p>
            </div>
          </div>

          {/* Scenario 3 */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-5">
            <div className="inline-flex items-center gap-1.5 rounded-chip bg-pine-50 border border-pine-200 px-2.5 py-0.5 text-[11px] font-semibold text-pine-800">
              Ergonomics Clinic ⇄ Digital Marketer
            </div>
            <div className="space-y-4">
              <div className="rounded-xl bg-surface-sunken p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-pine-800">
                  Party A Offers
                </span>
                <p className="text-xs font-semibold text-ink">8 Physical Therapy Sessions</p>
                <p className="text-[11px] text-text-secondary">
                  Posture rehabilitation, ergonomic workspace assessment, and deep tissue therapy.
                </p>
              </div>

              <div className="flex items-center justify-center">
                <div className="h-7 w-7 rounded-chip bg-pine-100 flex items-center justify-center text-primary">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
              </div>

              <div className="rounded-xl bg-surface-sunken p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-pine-800">
                  Party B Offers
                </span>
                <p className="text-xs font-semibold text-ink">Local Search SEO & Ads</p>
                <p className="text-[11px] text-text-secondary">
                  Google Business Profile optimization, local citation building, and review funnels.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-pine-50 border border-pine-200/80 p-3 text-center">
              <p className="text-xs font-semibold text-pine-800">Equal Bilateral Value</p>
              <p className="text-[11px] text-text-secondary">Cash spent: KES 0 • Healthier team & more clients</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. The Anti-Cash Engine: Comparison Matrix */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center space-y-3 mb-12">
          <div className="inline-flex items-center rounded-chip bg-pine-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-pine-800">
            The Collaborative Advantage
          </div>
          <h2 className="text-3xl sm:text-4xl font-medium tracking-tight text-ink">
            Stop Stalling Growth Waiting on Cash Flow
          </h2>
          <p className="mx-auto max-w-2xl text-base text-text-secondary">
            Cash shortages force small businesses to make painful trade-offs between legal protection,
            branding, and tech upgrades. Trade Weft removes the bottleneck.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Cash Economy */}
          <div className="rounded-2xl border border-border bg-surface p-8 space-y-6 shadow-xs flex flex-col justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-chip bg-surface-sunken px-3 py-1 text-xs font-bold uppercase tracking-wider text-text-secondary">
                The Cash Bottleneck
              </div>
              <h3 className="text-xl font-semibold text-ink">The Strained Cashflow Cycle</h3>
              <p className="text-xs text-text-secondary">
                How traditional procurement limits early-stage and growing professional service firms:
              </p>
              <ul className="space-y-3 text-xs text-text-secondary">
                <li className="flex items-start gap-2.5">
                  <span className="text-text-muted font-bold mt-0.5">•</span>
                  <span><strong>30 to 90 Day Delays:</strong> Waiting on slow-paying clients before you can fund your own critical projects.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-text-muted font-bold mt-0.5">•</span>
                  <span><strong>Burned Working Capital:</strong> Depleting liquid savings for operations that could be acquired via skill exchange.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-text-muted font-bold mt-0.5">•</span>
                  <span><strong>Wasted Consultant Capacity:</strong> Agency downtime between client contracts permanently disappears as lost revenue.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-text-muted font-bold mt-0.5">•</span>
                  <span><strong>Debt & Bad Faith Risk:</strong> Incurring collection fees, chasing invoices, or writing off uncollected balances.</span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl bg-surface-sunken p-4 text-xs text-text-secondary">
              Result: Critical upgrades get postponed indefinitely.
            </div>
          </div>

          {/* Trade Weft Barter */}
          <div className="rounded-2xl border-2 border-primary bg-pine-50/50 p-8 space-y-6 shadow-xs flex flex-col justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-chip bg-pine-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-pine-800">
                The Trade Weft Solution
              </div>
              <h3 className="text-xl font-semibold text-ink">Active Capability Exchange</h3>
              <p className="text-xs text-pine-800 font-medium">
                How forward-looking businesses leverage their skills as living currency:
              </p>
              <ul className="space-y-3 text-xs text-ink">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-pine-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Immediate Mutual Value:</strong> Both parties deliver work concurrently without touching precious cash balances.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-pine-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Monetize Idle Hours:</strong> Convert unused calendar availability into professional accounting, legal, or branding.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-pine-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Zero Commission Fees:</strong> Barter agreements are 100% free forever. No percentages or middleman cuts.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-pine-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Reputation as Capital:</strong> Each completed trade builds verified credibility on the public trust ledger.</span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl bg-pine-100 border border-pine-200 p-4 text-xs font-medium text-pine-800">
              Result: You get the services you need today, funded purely by your talent.
            </div>
          </div>
        </div>
      </section>

      {/* 6. Public Trust Ledger & Security Architecture */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-12 shadow-xs space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-chip bg-pine-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-pine-800">
                <ShieldCheck className="h-4 w-4 text-pine-600" aria-hidden="true" />
                Trust & Safety
              </div>
              <h2 className="text-3xl sm:text-4xl font-medium tracking-tight text-ink">
                Reputation Is the Currency of Service Barter
              </h2>
              <p className="text-base text-text-secondary max-w-xl">
                When cash is removed from the equation, transparency and mathematical integrity
                become paramount.
              </p>
            </div>
            <Link href="/trust">
              <Button variant="outline" size="md" className="gap-2">
                <span>How Trust Works</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-border bg-surface-sunken/60 p-6 space-y-3">
              <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-primary shadow-2xs border border-border">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-ink">Double-Blind Reviews</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Neither partner sees the other&apos;s evaluation until both have submitted, or until 14
                days have passed. Eliminates hostage feedback and retaliatory scores completely.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-sunken/60 p-6 space-y-3">
              <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-primary shadow-2xs border border-border">
                <Scale className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-ink">Bayesian Reliability Scoring</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Reputation calculation is smoothed by an empirical prior. One difficult client cannot
                destroy an honest track record, while chronic non-performers cannot conceal delays.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-sunken/60 p-6 space-y-3">
              <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-primary shadow-2xs border border-border">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-ink">Anti-Collusion Threshold</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Public reliability scores strictly require contracts with at least 3 distinct
                counterparties. Two friends cannot reciprocally fabricate artificial credibility.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Frequently Asked Questions */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="text-center space-y-3 mb-12">
          <div className="inline-flex items-center rounded-chip bg-pine-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-pine-800">
            Frequently Asked Questions
          </div>
          <h2 className="text-3xl sm:text-4xl font-medium tracking-tight text-ink">
            Everything You Need to Know
          </h2>
          <p className="mx-auto max-w-xl text-base text-text-secondary">
            Got questions about B2B barter in Kenya? Here are direct answers to how agreements,
            taxes, and fairness operate on Trade Weft.
          </p>
        </div>

        <div className="space-y-4">
          <details className="group rounded-2xl border border-border bg-surface p-6 shadow-xs [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between font-semibold text-ink list-none">
              <span className="text-base">How do we ensure both services are of equal value?</span>
              <span className="transition-transform duration-200 group-open:rotate-180 text-text-secondary">
                <ChevronDown className="h-5 w-5" aria-hidden="true" />
              </span>
            </summary>
            <p className="mt-4 text-xs text-text-secondary leading-relaxed border-t border-border/60 pt-4">
              Every package includes an <strong>indicative value guide</strong> (in KES) to establish
              a ballpark reference. During the bilateral proposal stage, both parties tailor deliverables,
              turnaround deadlines, and scope items until both sides are completely satisfied that the
              exchange is equitable before signing off.
            </p>
          </details>

          <details className="group rounded-2xl border border-border bg-surface p-6 shadow-xs [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between font-semibold text-ink list-none">
              <span className="text-base">Is service barter legal in Kenya?</span>
              <span className="transition-transform duration-200 group-open:rotate-180 text-text-secondary">
                <ChevronDown className="h-5 w-5" aria-hidden="true" />
              </span>
            </summary>
            <p className="mt-4 text-xs text-text-secondary leading-relaxed border-t border-border/60 pt-4">
              Yes, bilateral service barter is fully recognized under the Law of Contract Act (Cap 23,
              Laws of Kenya). For corporate accounting and KRA compliance, non-monetary exchanges are
              simply entered at fair market value as mutually offsetting sales and expenses.
            </p>
          </details>

          <details className="group rounded-2xl border border-border bg-surface p-6 shadow-xs [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between font-semibold text-ink list-none">
              <span className="text-base">Are there any fees or commissions to barter?</span>
              <span className="transition-transform duration-200 group-open:rotate-180 text-text-secondary">
                <ChevronDown className="h-5 w-5" aria-hidden="true" />
              </span>
            </summary>
            <p className="mt-4 text-xs text-text-secondary leading-relaxed border-t border-border/60 pt-4">
              No. Trading services on Trade Weft is <strong>100% free forever</strong>. We take zero
              cut, commission, or transaction fee. Trade Weft monetizes exclusively through optional
              promotional upgrades (such as Top Ad search placements and Boost subscription tiers) for
              providers seeking higher visibility.
            </p>
          </details>

          <details className="group rounded-2xl border border-border bg-surface p-6 shadow-xs [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between font-semibold text-ink list-none">
              <span className="text-base">What happens if a partner fails to deliver?</span>
              <span className="transition-transform duration-200 group-open:rotate-180 text-text-secondary">
                <ChevronDown className="h-5 w-5" aria-hidden="true" />
              </span>
            </summary>
            <p className="mt-4 text-xs text-text-secondary leading-relaxed border-t border-border/60 pt-4">
              All trade agreements include milestone checkpoints and agreed turnaround dates. If a
              party fails to perform, the trade is flagged for mediation, and unfulfilled obligations
              permanently impact the defaulting party&apos;s Proof of Reliability score on the public ledger.
            </p>
          </details>

          <details className="group rounded-2xl border border-border bg-surface p-6 shadow-xs [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between font-semibold text-ink list-none">
              <span className="text-base">Can I trade with businesses outside my neighborhood?</span>
              <span className="transition-transform duration-200 group-open:rotate-180 text-text-secondary">
                <ChevronDown className="h-5 w-5" aria-hidden="true" />
              </span>
            </summary>
            <p className="mt-4 text-xs text-text-secondary leading-relaxed border-t border-border/60 pt-4">
              Yes. Each service package clearly states its delivery mode: <strong>In-Person</strong> (for
              physical therapy, studio photography, or on-site workshops), <strong>Remote</strong> (for
              software engineering, digital marketing, or contract drafting), or <strong>Hybrid</strong>.
              You can filter by neighborhood or select remote delivery nationwide.
            </p>
          </details>

          <details className="group rounded-2xl border border-border bg-surface p-6 shadow-xs [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between font-semibold text-ink list-none">
              <span className="text-base">Can individual freelancers trade with registered companies?</span>
              <span className="transition-transform duration-200 group-open:rotate-180 text-text-secondary">
                <ChevronDown className="h-5 w-5" aria-hidden="true" />
              </span>
            </summary>
            <p className="mt-4 text-xs text-text-secondary leading-relaxed border-t border-border/60 pt-4">
              Yes. Trade Weft welcomes sole proprietors, registered limited companies, agency
              collectives, and independent professionals. All users verify their identity or business
              registration to maintain high trust throughout the network.
            </p>
          </details>
        </div>
      </section>

      {/* 8. Bottom Conversion Call to Action */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-pine-950 px-8 py-16 sm:px-16 sm:py-20 text-center text-white space-y-6">
          <div className="inline-flex items-center gap-2 rounded-chip bg-pine-900 border border-pine-800 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-pine-300">
            <Sparkles className="h-3.5 w-3.5 text-pine-400" aria-hidden="true" />
            Join the Nairobi Network
          </div>

          <h2 className="text-3xl sm:text-5xl font-medium tracking-tight max-w-2xl mx-auto leading-tight">
            Put your business capabilities to work today.
          </h2>

          <p className="text-base sm:text-lg text-pine-200 max-w-2xl mx-auto leading-relaxed">
            Connect with verified agencies and professionals across Nairobi. Trade what you know for
            what you need—with zero cash out of pocket.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/explore">
              <Button size="lg" variant="primary" className="gap-2 text-base px-8 h-13 bg-pine-600 hover:bg-pine-500">
                <span>Explore Packages</span>
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="lg" variant="outline" className="text-base px-8 h-13 border-pine-700 text-white hover:bg-pine-900">
                Create Free Account
              </Button>
            </Link>
          </div>

          <p className="text-xs text-[#A9B8B4] pt-2">
            No credit card required • 100% free for service barter • Kenya DPA 2019 compliant
          </p>
        </div>
      </section>
    </div>
  );
}
