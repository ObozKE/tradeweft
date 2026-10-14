import React from 'react';
import type { Metadata } from 'next';
import { requireFinanceOrAdmin } from '@/server/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { Sparkles, MapPin, Layers, Clock } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Top Ads Placements | Admin | Trade Weft',
  description: 'Manage active and held Top Ad pinned placements across Kenya.',
};

export default async function AdminPromotionsPage() {
  await requireFinanceOrAdmin();
  const adminSupabase = createAdminClient();

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
        title,
        status
      ),
      locations (
        name
      ),
      service_categories (
        name
      ),
      profiles (
        display_name
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Top Ad Pinned Placements</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Live monitoring of the 3-slot category and city exclusion constraint placement grid.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
        {!promotions || promotions.length === 0 ? (
          <div className="py-12 text-center text-xs text-text-muted">
            No listing promotions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 text-start font-semibold">Location</th>
                  <th className="py-2.5 text-start font-semibold">Category</th>
                  <th className="py-2.5 text-start font-semibold">Slot</th>
                  <th className="py-2.5 text-start font-semibold">Package Title</th>
                  <th className="py-2.5 text-start font-semibold">Provider</th>
                  <th className="py-2.5 text-start font-semibold">Status</th>
                  <th className="py-2.5 text-end font-semibold">Period</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {promotions.map((promo: any) => {
                  const pkg = promo.service_packages;
                  const loc = promo.locations;
                  const cat = promo.service_categories;
                  const prov = promo.profiles;

                  return (
                    <tr key={promo.id} className="hover:bg-surface-raised/50 transition-colors">
                      <td className="py-3 font-semibold text-ink">
                        {loc?.name || 'All Cities'}
                      </td>
                      <td className="py-3 text-text-secondary">
                        {cat?.name || 'All Categories'}
                      </td>
                      <td className="py-3">
                        <span className="font-mono font-bold text-pine-800 bg-pine-50 px-2 py-0.5 rounded border border-pine-200">
                          #{promo.slot_no}
                        </span>
                      </td>
                      <td className="py-3 font-medium text-ink">
                        {pkg?.title || 'Unknown Package'}
                      </td>
                      <td className="py-3 text-text-secondary">
                        {prov?.display_name || 'Anonymous'}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            promo.status === 'active'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : promo.status === 'held'
                              ? 'bg-sand-100 text-ink'
                              : 'bg-sand-50 text-text-muted'
                          }`}
                        >
                          {promo.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 text-end font-mono text-[11px] text-text-muted">
                        {promo.period ? 'Active Range' : '—'}
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
