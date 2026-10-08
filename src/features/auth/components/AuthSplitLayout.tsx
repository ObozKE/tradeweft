import React from 'react';
import Link from 'next/link';
import { BrandWordmark } from '@/components/shared/BrandWordmark';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GoogleSignInForm } from './GoogleSignInForm';
import { EmailAuthForm } from './EmailAuthForm';

export interface AuthSplitLayoutProps {
  mode: 'login' | 'signup';
  title: string;
  subtitle: string;
  consentNotice?: string;
  emailSubmitButtonLabel: string;
  orLabel?: string;
  footerPrompt: string;
  footerLinkText: string;
  footerLinkHref: string;
  next?: string;
}

export function AuthSplitLayout({
  mode,
  title,
  subtitle,
  consentNotice,
  emailSubmitButtonLabel,
  orLabel = 'or',
  footerPrompt,
  footerLinkText,
  footerLinkHref,
  next = '/dashboard',
}: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand Hero Panel (Desktop Left, Pine-950) */}
      <div className="relative hidden w-full flex-col justify-between overflow-hidden bg-pine-950 p-12 text-white lg:flex lg:w-1/2 xl:p-16">
        {/* Subtle decorative grid motif (under 2KB) */}
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #01796F 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
          aria-hidden="true"
        />

        <div className="relative z-10">
          <BrandWordmark theme="dark" />
        </div>

        <div className="relative z-10 my-auto max-w-lg space-y-6">
          <div className="inline-flex items-center rounded-chip bg-pine-800/80 px-3.5 py-1 text-xs font-medium uppercase tracking-[0.08em] text-pine-200">
            Nairobi Launch Edition
          </div>
          <h1 className="text-4xl font-medium tracking-tight text-white xl:text-5xl">
            Trade your services without cash.
          </h1>
          <p className="text-base text-pine-200/90 leading-relaxed">
            Connect with verified web developers, accountants, fitness coaches, and marketing specialists in Nairobi. Exchange high-value work directly and build your public trust ledger.
          </p>
        </div>

        <div className="relative z-10 border-t border-pine-900 pt-6 text-xs text-[#A9B8B4]">
          <p>© 2026 Trade Weft. Built for Kenya and expanding across Africa.</p>
        </div>
      </div>

      {/* Auth Content Panel (Mobile Full / Desktop Right) */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-12 xl:px-24">
        {/* Mobile Header Wordmark */}
        <div className="mb-8 flex justify-center lg:hidden">
          <BrandWordmark theme="light" />
        </div>

        <div className="mx-auto w-full max-w-md">
          <Card className="border-border bg-surface shadow-sm">
            <CardHeader className="text-start pb-4">
              <CardTitle className="text-2xl font-semibold text-ink">
                {title}
              </CardTitle>
              <CardDescription className="text-sm text-text-secondary mt-1">
                {subtitle}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Primary OAuth Method */}
              <GoogleSignInForm next={next} />

              {/* Accessible Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-surface px-3 text-text-muted">
                    {orLabel}
                  </span>
                </div>
              </div>

              {/* Email & Password Authentication */}
              <EmailAuthForm
                mode={mode}
                next={next}
                submitButtonLabel={emailSubmitButtonLabel}
                termsNotice={consentNotice}
              />

              <div className="border-t border-border pt-4 text-center text-sm text-text-secondary">
                <span>{footerPrompt} </span>
                <Link
                  href={footerLinkHref}
                  className="font-medium text-primary hover:underline hover:text-pine-700"
                >
                  {footerLinkText}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
