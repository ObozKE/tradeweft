import { getTranslations } from 'next-intl/server';
import { AuthSplitLayout } from '@/features/auth';
import { sanitizeRedirectUrl } from '@/lib/security';

interface LoginPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const t = await getTranslations('auth.login');
  const tCommon = await getTranslations('common');
  const params = await searchParams;
  const rawNext = typeof params.next === 'string' ? params.next : undefined;
  const next = sanitizeRedirectUrl(rawNext);

  return (
    <AuthSplitLayout
      mode="login"
      title={t('title')}
      subtitle={t('subtitle')}
      emailSubmitButtonLabel={t('signInButton')}
      orLabel={tCommon('or')}
      footerPrompt={t('noAccount')}
      footerLinkText={t('createAccount')}
      footerLinkHref="/signup"
      next={next}
    />
  );
}
