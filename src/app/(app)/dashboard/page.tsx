import { requireOnboardedUser } from '@/server/dal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getTranslations } from 'next-intl/server';
import {
  ShieldCheck,
  MapPin,
  Briefcase,
  Globe,
  Layers,
  Handshake,
  Star,
  Smartphone,
} from 'lucide-react';

export default async function DashboardPage() {
  const { user, profile, supabase } = await requireOnboardedUser();
  const t = await getTranslations('dashboard');

  // Resolve location names for display
  let cityName = 'Nairobi';
  let areaName = 'Nairobi Area';

  if (profile.city_id) {
    const { data: city } = await supabase
      .from('locations')
      .select('name')
      .eq('id', profile.city_id)
      .single();
    if (city) cityName = city.name;
  }

  if (profile.area_id) {
    const { data: area } = await supabase
      .from('locations')
      .select('name')
      .eq('id', profile.area_id)
      .single();
    if (area) areaName = area.name;
  }

  return (
    <div className="space-y-8">
      {/* Welcome & Identity Card */}
      <Card className="border-border bg-white shadow-sm overflow-hidden">
        <div className="h-3 bg-primary" />
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-chip bg-pine-100 px-3 py-1 text-xs font-medium text-pine-800">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Verified Member (Kenya)
              </span>
            </div>
            <CardTitle className="text-3xl font-semibold text-ink mt-2">
              {t('welcome', { name: profile.display_name || user.email?.split('@')[0] || 'Member' })}
            </CardTitle>
            <CardDescription className="text-sm text-text-secondary">
              Logged in as {user.email} • ID: {user.id.slice(0, 8)}...
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="border-t border-border pt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Account Type */}
            <div className="flex items-center gap-3 rounded-button border border-border bg-surface-sunken/40 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-chip bg-pine-200 text-pine-900">
                <Briefcase className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
                  Account Type
                </p>
                <p className="text-sm font-semibold capitalize text-ink">
                  {profile.account_type || 'Freelancer'}
                  {profile.business_name ? ` (${profile.business_name})` : ''}
                </p>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-center gap-3 rounded-button border border-border bg-surface-sunken/40 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-chip bg-pine-200 text-pine-900">
                <MapPin className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
                  Location
                </p>
                <p className="text-sm font-semibold text-ink">
                  {areaName}, {cityName}
                </p>
              </div>
            </div>

            {/* Remote Delivery */}
            <div className="flex items-center gap-3 rounded-button border border-border bg-surface-sunken/40 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-chip bg-pine-200 text-pine-900">
                <Globe className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
                  Remote Delivery
                </p>
                <p className="text-sm font-semibold text-ink">
                  {profile.remote_delivery ? t('enabled') : t('disabled')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phase 1 Completion & Extensibility Roadmap Tile Board */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">Marketplace Architecture & Roadmap</h2>
          <p className="text-sm text-text-secondary mt-1">
            Phase 1 authentication and onboarding foundation is active. Here is where upcoming modules plug in seamlessly:
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Service Listings */}
          <div className="flex flex-col justify-between rounded-lg border border-border bg-white p-6 shadow-sm">
            <div className="space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-chip bg-surface-sunken text-ink">
                <Layers className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-ink">Service Listings</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Plugs into <code className="rounded bg-muted px-1 py-0.5 text-xs text-pine-800">src/features/listings</code>. Allows businesses to list skills offered and skills sought for trade.
              </p>
            </div>
            <span className="mt-4 inline-block text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
              Phase 2 Ready
            </span>
          </div>

          {/* Barter Agreements */}
          <div className="flex flex-col justify-between rounded-lg border border-border bg-white p-6 shadow-sm">
            <div className="space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-chip bg-surface-sunken text-ink">
                <Handshake className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-ink">Barter Agreements</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Plugs into <code className="rounded bg-muted px-1 py-0.5 text-xs text-pine-800">src/features/agreements</code>. Two-way trade proposals, milestone tracking, and contract sign-off.
              </p>
            </div>
            <span className="mt-4 inline-block text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
              Phase 3 Ready
            </span>
          </div>

          {/* Trust Ledger */}
          <div className="flex flex-col justify-between rounded-lg border border-border bg-white p-6 shadow-sm">
            <div className="space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-chip bg-surface-sunken text-ink">
                <Star className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-ink">Trust Ledger</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Plugs into <code className="rounded bg-muted px-1 py-0.5 text-xs text-pine-800">src/features/trust</code>. Double-blind verified reviews, trade reputation score, and dispute history.
              </p>
            </div>
            <span className="mt-4 inline-block text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
              Phase 4 Ready
            </span>
          </div>

          {/* M-Pesa / Payments */}
          <div className="flex flex-col justify-between rounded-lg border border-border bg-white p-6 shadow-sm">
            <div className="space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-chip bg-surface-sunken text-ink">
                <Smartphone className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-ink">M-Pesa Escrow</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Implements <code className="rounded bg-muted px-1 py-0.5 text-xs text-pine-800">PaymentProvider</code> adapter. Handles commitment escrow and cash-top-up barters in Kenya Shillings.
              </p>
            </div>
            <span className="mt-4 inline-block text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
              Daraja Integration
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
