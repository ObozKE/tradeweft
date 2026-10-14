import { getTranslations } from 'next-intl/server';
import { AuthSplitLayout } from '@/features/auth';
import { sanitizeRedirectUrl } from '@/lib/security';

interface SignupPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const t = await getTranslations('auth.signup');
  const tCommon = await getTranslations('common');
  const params = await searchParams;
  const rawNext = typeof params.next === 'string' ? params.next : undefined;
  const next = sanitizeRedirectUrl(rawNext);

  return (
    <AuthSplitLayout
      mode="signup"
      title={t('title')}
      subtitle={t('subtitle')}
      consentNotice={t('consentNotice')}
      emailSubmitButtonLabel={t('signUpButton')}
      orLabel={tCommon('or')}
      footerPrompt={t('hasAccount')}
      footerLinkText={t('signIn')}
      footerLinkHref="/login"
      next={next}
    />
  );
}
