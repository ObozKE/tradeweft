'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  authInitiateLimiter,
  emailLoginLimiter,
  emailSignupLimiter,
} from '@/lib/rate-limit';
import { sanitizeRedirectUrl } from '@/lib/security';
import { logger, maskEmail } from '@/lib/logger';
import {
  emailLoginSchema,
  emailSignupSchema,
} from '../schemas/auth.schema';

export interface AuthActionState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  info?: string;
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

export async function signInWithEmailAction(
  prevState: AuthActionState | null,
  formData: FormData
): Promise<AuthActionState> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
  const rawNext = formData.get('next') as string | null;
  const next = sanitizeRedirectUrl(rawNext);

  // Rate limit email login by IP
  const limit = await emailLoginLimiter.check(ip);
  if (!limit.success) {
    logger.warn({ ip, event: 'rate_limit.hit', action: 'email_login' });
    return {
      error: 'Too many login attempts. Please wait a few moments and try again.',
      isRateLimited: true,
    };
  }

  const rawData = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const validation = emailLoginSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      fieldErrors: validation.error.flatten().fieldErrors,
      error: 'Please enter a valid email and password.',
    };
  }

  const { email, password } = validation.data;
  const supabase = await createClient();

  logger.info({ email: maskEmail(email), event: 'auth.email_login.started' }, 'Attempting email sign-in');

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    logger.warn({ email: maskEmail(email), error: error?.message, event: 'auth.email_login.failed' }, 'Email sign-in failed');
    return {
      error: 'The email or password you entered is incorrect. Please try again.',
    };
  }

  logger.info({ userId: data.user.id, email: maskEmail(email), event: 'auth.email_login.succeeded' }, 'Email sign-in succeeded');

  // Verify onboarding status
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', data.user.id)
    .single();

  if (!profile || !profile.onboarding_completed_at) {
    redirect('/onboarding');
  }

  redirect(next);
}

export async function signUpWithEmailAction(
  prevState: AuthActionState | null,
  formData: FormData
): Promise<AuthActionState> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
  const rawNext = formData.get('next') as string | null;
  const next = sanitizeRedirectUrl(rawNext);

  // Rate limit signup by IP
  const limit = await emailSignupLimiter.check(ip);
  if (!limit.success) {
    logger.warn({ ip, event: 'rate_limit.hit', action: 'email_signup' });
    return {
      error: 'Too many signup attempts. Please wait a few moments and try again.',
      isRateLimited: true,
    };
  }

  const rawData = {
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    termsAccepted: formData.get('termsAccepted') === 'true' || formData.get('termsAccepted') === 'on',
  };

  const validation = emailSignupSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      fieldErrors: validation.error.flatten().fieldErrors,
      error: 'Please correct the highlighted errors.',
    };
  }

  const { email, password } = validation.data;
  const supabase = await createClient();

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (headerStore.get('origin') ?? 'http://localhost:3000');

  logger.info({ email: maskEmail(email), event: 'auth.email_signup.started' }, 'Attempting email signup');

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    logger.warn({ email: maskEmail(email), error: error.message, event: 'auth.email_signup.failed' }, 'Email signup failed');
    if (error.message.toLowerCase().includes('already registered')) {
      return {
        error: 'An account with this email already exists. Please sign in instead.',
      };
    }
    return {
      error: error.message || 'Unable to create account. Please try again.',
    };
  }

  // If user session is returned immediately (email confirmation disabled)
  if (data.session && data.user) {
    logger.info({ userId: data.user.id, email: maskEmail(email), event: 'auth.email_signup.succeeded' }, 'Email signup succeeded with active session');
    redirect('/onboarding');
  }

  // If email confirmation is required
  logger.info({ email: maskEmail(email), event: 'auth.email_signup.confirmation_required' }, 'Email confirmation email sent');
  return {
    info: 'Verification email sent. Please check your inbox to confirm your account and sign in.',
  };
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
