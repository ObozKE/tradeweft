import React from 'react';
import Link from 'next/link';
import { requireStaffUser } from '@/server/dal';
import {
  ShieldCheck,
  CheckSquare,
  MessageSquare,
  CreditCard,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { roles } = await requireStaffUser();

  const isVerifier = roles.includes('verifier') || roles.includes('admin');
  const isFinance = roles.includes('finance') || roles.includes('admin');

  return (
    <div className="space-y-6">
      {/* Admin Subheader & Navigation */}
      <div className="border-b border-sand-200 pb-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-pine-100 text-pine-800">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-ink">Admin Console</h1>
                <span className="rounded bg-pine-100 px-2 py-0.5 text-xs font-semibold text-pine-900 uppercase">
                  {roles.includes('admin')
                    ? 'Administrator'
                    : isFinance
                    ? 'Finance'
                    : 'Verifier'}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Trust, Verification &amp; Monetization Operations
              </p>
            </div>
          </div>

          <nav className="flex items-center flex-wrap gap-2 text-xs">
            {isVerifier && (
              <>
                <Link
                  href="/admin/verification"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold text-pine-800 hover:bg-pine-50 transition border border-transparent hover:border-pine-200"
                >
                  <CheckSquare className="w-4 h-4" />
                  Verifications
                </Link>
                <Link
                  href="/admin/moderation"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold text-text-secondary hover:text-pine-800 hover:bg-sand-100 transition"
                >
                  <MessageSquare className="w-4 h-4" />
                  Moderation
                </Link>
              </>
            )}

            {isFinance && (
              <>
                <Link
                  href="/admin/payments"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold text-text-secondary hover:text-pine-800 hover:bg-sand-100 transition"
                >
                  <CreditCard className="w-4 h-4" />
                  Payments
                </Link>
                <Link
                  href="/admin/promotions"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold text-text-secondary hover:text-pine-800 hover:bg-sand-100 transition"
                >
                  <Sparkles className="w-4 h-4" />
                  Top Ads
                </Link>
                <Link
                  href="/admin/revenue"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold text-text-secondary hover:text-pine-800 hover:bg-sand-100 transition"
                >
                  <TrendingUp className="w-4 h-4" />
                  Revenue
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}
