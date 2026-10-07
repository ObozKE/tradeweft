'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { authInitiateLimiter } from '@/lib/rate-limit';
import { sanitizeRedirectUrl } from '@/lib/security';
import { logger } from '@/lib/logger';

export interface AuthActionState {
  error?: string;
  isRateLimited?: boolean;
}

export async function initiateGoogleAuthAction(
  prevState: AuthActionState | null,
  formData: FormData
): Promise<AuthActionState> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
  const rawNext = formData.get('next') as string | null;
  const next = sanitizeRedirectUrl(rawNext);

  // Rate limit OAuth initiation
  const limitResult = await authInitiateLimiter.check(ip);
  if (!limitResult.success) {
    logger.warn({ ip, event: 'auth.login.rate_limited' }, 'OAuth initiation rate limited');
    return {
      error: 'Too many sign-in attempts. Please wait a minute and try again.',
      isRateLimited: true,
    };
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (headerStore.get('origin') ?? 'http://localhost:3000');

  const supabase = await createClient();

  logger.info({ ip, event: 'auth.login.started' }, 'Initiating Google OAuth');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: 'openid email profile',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error || !data?.url) {
    logger.error({ error, event: 'auth.login.failed' }, 'Supabase Google OAuth initiation error');
    return {
      error: 'Unable to connect to Google authentication. Please try again.',
    };
  }

  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  logger.info(
    { userId: user?.id, event: 'auth.signout' },
    'User signing out'
  );

  await supabase.auth.signOut();
  redirect('/login');
}
