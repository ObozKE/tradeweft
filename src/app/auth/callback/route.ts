import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeRedirectUrl } from '@/lib/security';
import { authCallbackLimiter } from '@/lib/rate-limit';
import { logger, maskEmail } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const rawNext = requestUrl.searchParams.get('next');
  const next = sanitizeRedirectUrl(rawNext);

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  // 1. Rate limiting check
  const rateLimit = await authCallbackLimiter.check(ip);
  if (!rateLimit.success) {
    logger.warn({ ip, event: 'rate_limit.hit', path: '/auth/callback' }, 'Rate limit exceeded on callback');
    return NextResponse.redirect(
      new URL('/auth/error?code=RATE_LIMITED', requestUrl.origin)
    );
  }

  // 2. Handle provider errors / cancellations
  if (errorParam) {
    logger.warn(
      { ip, error: errorParam, description: errorDescription, event: 'auth.login.provider_error' },
      'OAuth provider returned error'
    );
    if (errorParam === 'access_denied') {
      return NextResponse.redirect(
        new URL('/auth/error?code=access_denied', requestUrl.origin)
      );
    }
    return NextResponse.redirect(
      new URL('/auth/error?code=oauth_failed', requestUrl.origin)
    );
  }

  // 3. Exchange code for session
  if (!code) {
    logger.warn({ ip, event: 'auth.login.missing_code' }, 'No code parameter provided');
    return NextResponse.redirect(
      new URL('/auth/error?code=missing_code', requestUrl.origin)
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    logger.error(
      { ip, error: error?.message, event: 'auth.login.exchange_failed' },
      'Failed to exchange authorization code for session'
    );
    return NextResponse.redirect(
      new URL('/auth/error?code=invalid_code', requestUrl.origin)
    );
  }

  const user = data.user;
  logger.info(
    {
      userId: user.id,
      email: maskEmail(user.email || ''),
      event: 'auth.login.succeeded',
    },
    'User successfully authenticated with Google'
  );

  // 4. Determine onboarding status
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.onboarding_completed_at) {
    // Session is active but onboarding is incomplete
    return NextResponse.redirect(new URL('/onboarding', requestUrl.origin));
  }

  // 5. Onboarding is complete: redirect to sanitized next URL
  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
