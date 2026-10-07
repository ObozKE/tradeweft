import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, RefreshCw, ShieldCheck, MapPin } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="space-y-16 py-12 md:py-20">
      {/* Hero Section */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 text-center space-y-8">
        <div className="inline-flex items-center gap-2 rounded-chip bg-pine-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-pine-800">
          <span>Nairobi Launch Edition</span>
          <span className="text-pine-500">•</span>
          <span>Zero Cash Required</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-medium tracking-tight text-ink leading-[1.1]">
          Trade your services. <br />
          <span className="text-primary">Keep your cash.</span>
        </h1>

        <p className="mx-auto max-w-2xl text-lg sm:text-xl text-text-secondary leading-relaxed">
          The B2B barter marketplace for Nairobi freelancers and businesses. Trade your web development for physical therapy, or your accounting for office branding.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link href="/signup">
            <Button size="lg" variant="primary" className="gap-2 text-base px-8 h-13">
              <span>Continue with Google</span>
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="text-base px-8 h-13">
              Sign In to Dashboard
            </Button>
          </Link>
        </div>
      </section>

      {/* Feature Value Props */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Card 1 */}
          <div className="rounded-lg border border-border bg-white p-8 shadow-sm space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-chip bg-pine-100 text-primary">
              <RefreshCw className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-semibold text-ink">Equal Value Barter</h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              Agree on project scopes and deliverables. No invoices to chase, no delays—services are exchanged mutually with clear milestones.
            </p>
          </div>

          {/* Card 2 */}
          <div className="rounded-lg border border-border bg-white p-8 shadow-sm space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-chip bg-pine-100 text-primary">
              <MapPin className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-semibold text-ink">Hyper-Local to Nairobi</h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              Match with businesses in your exact neighborhood—Kilimani, Westlands, Karen, Upper Hill—or choose Remote Delivery for digital trades.
            </p>
          </div>

          {/* Card 3 */}
          <div className="rounded-lg border border-border bg-white p-8 shadow-sm space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-chip bg-pine-100 text-primary">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-semibold text-ink">Public Trust Ledger</h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              Every completed barter adds a verified thread to your reputation. Double-blind reviews guarantee authenticity and dispute safety.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
