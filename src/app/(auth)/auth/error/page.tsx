import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandWordmark } from '@/components/shared/BrandWordmark';

interface AuthErrorPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = 'force-dynamic';

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const t = await getTranslations('auth.error');
  const params = await searchParams;
  const code = typeof params.code === 'string' ? params.code : 'default';

  let errorMessage = t('defaultMessage');
  if (code === 'access_denied') {
    errorMessage = t('accessDenied');
  } else if (code === 'invalid_code' || code === 'missing_code') {
    errorMessage = t('expiredCode');
  } else if (code === 'RATE_LIMITED') {
    errorMessage = 'Too many requests. Please wait a few moments before trying again.';
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <BrandWordmark />
      </div>

      <div className="w-full max-w-md">
        <Card className="border border-amber-700/30 bg-surface shadow-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-chip bg-amber-100 text-amber-800">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl font-medium text-ink">
              {t('title')}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6 text-center">
            <p className="text-sm text-text-secondary leading-relaxed">
              {errorMessage}
            </p>

            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex h-11 w-full items-center justify-center rounded-button bg-primary px-6 text-sm font-medium text-white transition hover:bg-pine-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine-500"
              >
                {t('backToLogin')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
