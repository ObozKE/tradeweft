import React from 'react';
import Link from 'next/link';
import { BrandWordmark } from '@/components/shared/BrandWordmark';
import { requireOnboardedUser } from '@/server/dal';
import { signOutAction } from '@/features/auth';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { NotificationBell } from '@/features/agreements/components/NotificationBell';
import {
  getUnreadNotificationsCount,
  getUserNotifications,
} from '@/features/agreements/queries/notification.queries';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, supabase } = await requireOnboardedUser();

  const [unreadCount, recentNotifications, roleRecords] = await Promise.all([
    getUnreadNotificationsCount(user.id),
    getUserNotifications(user.id, 5),
    supabase.from('user_roles').select('role').eq('user_id', user.id),
  ]);

  const roles = (roleRecords.data || []).map((r: { role: string }) => r.role);
  const isVerifierOrAdmin = roles.includes('verifier') || roles.includes('admin');

  return (
    <div className="min-h-screen bg-background">
      {/* App Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
          <div className="flex items-center gap-6">
            <BrandWordmark />
            <nav className="hidden md:flex items-center gap-4 text-xs font-semibold text-text-secondary">
              <Link href="/dashboard" className="hover:text-pine-700 transition-colors">
                Dashboard
              </Link>
              <Link href="/dashboard/packages" className="hover:text-pine-700 transition-colors">
                My Packages
              </Link>
              <Link href="/dashboard/trades" className="hover:text-pine-700 transition-colors">
                Trades
              </Link>
              <Link href="/dashboard/matches" className="hover:text-pine-700 transition-colors">
                Matches
              </Link>
              <Link href="/dashboard/reviews" className="hover:text-pine-700 transition-colors">
                Reviews
              </Link>
              <Link href="/dashboard/verification" className="hover:text-pine-700 transition-colors">
                Verification
              </Link>
              <Link href="/dashboard/billing" className="hover:text-pine-700 transition-colors">
                Billing
              </Link>
              {isVerifierOrAdmin && (
                <Link
                  href="/admin/verification"
                  className="rounded bg-pine-100 px-2 py-0.5 text-[11px] font-bold text-pine-900 border border-pine-200 hover:bg-pine-200 transition-colors"
                >
                  Verifications
                </Link>
              )}
              {roles.includes('finance') || roles.includes('admin') ? (
                <Link
                  href="/admin/payments"
                  className="rounded bg-sand-200 px-2 py-0.5 text-[11px] font-bold text-ink border border-sand-300 hover:bg-sand-300 transition-colors"
                >
                  Finance
                </Link>
              ) : null}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            <NotificationBell
              initialUnreadCount={unreadCount}
              recentNotifications={recentNotifications}
            />

            <div className="hidden sm:flex flex-col text-end">
              <span className="text-sm font-medium text-ink leading-tight">
                {profile.display_name || user.email}
              </span>
              <span className="text-xs text-text-muted capitalize">
                {profile.account_type} • {profile.country_code}
              </span>
            </div>

            <form action={signOutAction}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* Main App Workspace */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
