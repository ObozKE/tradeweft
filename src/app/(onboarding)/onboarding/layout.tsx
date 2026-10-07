import React from 'react';
import { BrandWordmark } from '@/components/shared/BrandWordmark';

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-white py-4 px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <BrandWordmark />
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
            Step 1: Profile Setup
          </span>
        </div>
      </header>
      <main className="py-10 px-4 sm:px-6">{children}</main>
    </div>
  );
}
