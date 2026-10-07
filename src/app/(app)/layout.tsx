import React from 'react';
import { BrandWordmark } from '@/components/shared/BrandWordmark';
import { requireOnboardedUser } from '@/server/dal';
import { signOutAction } from '@/features/auth';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireOnboardedUser();

  return (
    <div className="min-h-screen bg-background">
      {/* App Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
          <BrandWordmark />

          <div className="flex items-center gap-4">
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
                <span>Sign Out</span>
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
