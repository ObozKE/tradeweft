import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  hashOAuthState,
} from '@/features/verification/utils/pkce';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', '/dashboard/verification');
    return NextResponse.redirect(loginUrl);
  }

  const state = crypto.randomUUID();
  const stateHash = hashOAuthState(state);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  // Store PKCE verifier and state hash in single-use table
  const { error: dbError } = await supabase.from('oauth_states').insert({
    user_id: user.id,
    provider_key: 'github',
    state_hash: stateHash,
    code_verifier: codeVerifier,
    expires_at: expiresAt,
  });

  if (dbError) {
    logger.error({
      userId: user.id,
      error: dbError.message,
      event: 'verification.oauth_state_insert_failed',
    });
    const errorUrl = new URL('/dashboard/verification', request.url);
    errorUrl.searchParams.set('error', 'state_init_failed');
    return NextResponse.redirect(errorUrl);
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${new URL(request.url).protocol}//${new URL(request.url).host}`;
  const redirectUri = `${appUrl}/api/verify/github/callback`;
  const clientId = process.env.GITHUB_CLIENT_ID;

  // Development/Test fallback when GitHub OAuth credentials are not configured
  if (!clientId) {
    if (process.env.NODE_ENV !== 'production' || process.env.MOCK_GITHUB_OAUTH === 'true') {
      logger.warn({
        userId: user.id,
        event: 'verification.github_oauth_mock_started',
      });
      const mockCallbackUrl = new URL(redirectUri);
      mockCallbackUrl.searchParams.set('code', `mock_gh_code_${user.id}`);
      mockCallbackUrl.searchParams.set('state', state);
      return NextResponse.redirect(mockCallbackUrl);
    }

    logger.error({ event: 'verification.github_client_id_missing' });
    const errorUrl = new URL('/dashboard/verification', request.url);
    errorUrl.searchParams.set('error', 'github_not_configured');
    return NextResponse.redirect(errorUrl);
  }

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'read:user');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return NextResponse.redirect(authUrl);
}
