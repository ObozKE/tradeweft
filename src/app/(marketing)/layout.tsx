import React from 'react';
import Link from 'next/link';
import { BrandWordmark } from '@/components/shared/BrandWordmark';
import { Button } from '@/components/ui/button';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-18">
          <BrandWordmark />

          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-ink hover:text-primary transition"
            >
              Sign In
            </Link>
            <Link href="/signup">
              <Button size="sm" variant="primary">
                Get Started
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Pine-950 Footer */}
      <footer className="bg-pine-950 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <BrandWordmark theme="dark" />
            <p className="text-xs text-pine-300">
              The B2B service barter marketplace for Nairobi, Kenya and Africa.
            </p>
          </div>

          <div className="flex flex-wrap gap-6 text-xs text-[#A9B8B4]">
            <Link href="/signup" className="hover:text-white transition">
              Terms of Service
            </Link>
            <Link href="/signup" className="hover:text-white transition">
              Privacy Policy (Kenya DPA 2019)
            </Link>
            <Link href="/login" className="hover:text-white transition">
              Sign In
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-7xl mt-8 pt-6 border-t border-pine-900 text-center text-xs text-[#A9B8B4]">
          <p>© 2026 Trade Weft. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
