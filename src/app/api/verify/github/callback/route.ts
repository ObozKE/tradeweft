import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { hashOAuthState } from '@/features/verification/utils/pkce';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const redirectBase = new URL('/dashboard/verification', request.url);

  if (oauthError) {
    logger.warn({ oauthError, event: 'verification.github_oauth_rejected_by_user' });
    redirectBase.searchParams.set('error', 'github_access_denied');
    return NextResponse.redirect(redirectBase);
  }

  if (!code || !state) {
    redirectBase.searchParams.set('error', 'missing_oauth_params');
    return NextResponse.redirect(redirectBase);
  }

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

  const stateHash = hashOAuthState(state);

  // Look up short-lived PKCE state
  const { data: stateRecord, error: stateQueryError } = await supabase
    .from('oauth_states')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider_key', 'github')
    .eq('state_hash', stateHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (stateQueryError || !stateRecord) {
    logger.warn({ userId: user.id, event: 'verification.invalid_oauth_state' });
    redirectBase.searchParams.set('error', 'invalid_oauth_state');
    return NextResponse.redirect(redirectBase);
  }

  // Single-use: delete state record immediately
  await supabase.from('oauth_states').delete().eq('id', stateRecord.id);

  let ghUser: { id: number; login: string; created_at: string };

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  // Development/Test mock flow (Strictly forbidden in production)
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.ALLOW_DEV_OAUTH_MOCKS === 'true' &&
    code.startsWith('mock_gh_code_') &&
    (!clientId || !clientSecret)
  ) {
    ghUser = {
      id: 99887766,
      login: 'tradeweft-dev',
      created_at: '2022-01-01T00:00:00Z',
    };
  } else {
    if (!clientId || !clientSecret) {
      redirectBase.searchParams.set('error', 'github_not_configured');
      return NextResponse.redirect(redirectBase);
    }

    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          code_verifier: stateRecord.code_verifier,
        }),
      });

      if (!tokenRes.ok) {
        throw new Error(`Token exchange returned ${tokenRes.status}`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        throw new Error(tokenData.error_description || 'No access token returned from GitHub');
      }

      // Query GitHub user profile
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'TradeWeft-Verification',
        },
      });

      if (!userRes.ok) {
        throw new Error(`User lookup returned ${userRes.status}`);
      }

      ghUser = await userRes.json();
      // Zero token persistence: accessToken is out of scope and never stored
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ userId: user.id, error: errorMsg, event: 'verification.github_exchange_failed' });
      redirectBase.searchParams.set('error', 'github_exchange_failed');
      return NextResponse.redirect(redirectBase);
    }
  }

  // 30-Day Minimum Account Age Enforcement
  const accountCreatedAt = new Date(ghUser.created_at);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (accountCreatedAt > thirtyDaysAgo) {
    logger.warn({
      userId: user.id,
      accountCreatedAt: ghUser.created_at,
      event: 'verification.github_account_too_young',
    });
    redirectBase.searchParams.set('error', 'github_account_too_young');
    return NextResponse.redirect(redirectBase);
  }

  const externalAccountId = String(ghUser.id);
  const handle = ghUser.login;
  const canonicalUrl = `https://github.com/${handle}`;
  const now = new Date().toISOString();

  // Check existing portfolio link for user
  const { data: existingLink } = await supabase
    .from('portfolio_links')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('provider_key', 'github')
    .maybeSingle();

  if (existingLink) {
    const { error: updateError } = await supabase
      .from('portfolio_links')
      .update({
        url: canonicalUrl,
        canonical_url: canonicalUrl,
        external_account_id: externalAccountId,
        handle,
        method: 'oauth',
        status: 'verified',
        verified_at: now,
        last_checked_at: now,
        reject_reason: null,
        reject_note: null,
        updated_at: now,
      })
      .eq('id', existingLink.id);

    if (updateError) {
      if (updateError.code === '23505') {
        redirectBase.searchParams.set('error', 'account_already_verified');
        return NextResponse.redirect(redirectBase);
      }
      logger.error({ userId: user.id, error: updateError.message, event: 'verification.link_update_failed' });
      redirectBase.searchParams.set('error', 'verification_save_failed');
      return NextResponse.redirect(redirectBase);
    }
  } else {
    const { error: insertError } = await supabase.from('portfolio_links').insert({
      user_id: user.id,
      provider_key: 'github',
      url: canonicalUrl,
      canonical_url: canonicalUrl,
      external_account_id: externalAccountId,
      handle,
      method: 'oauth',
      status: 'verified',
      verified_at: now,
      last_checked_at: now,
    });

    if (insertError) {
      if (insertError.code === '23505') {
        redirectBase.searchParams.set('error', 'account_already_verified');
        return NextResponse.redirect(redirectBase);
      }
      logger.error({ userId: user.id, error: insertError.message, event: 'verification.link_insert_failed' });
      redirectBase.searchParams.set('error', 'verification_save_failed');
      return NextResponse.redirect(redirectBase);
    }
  }

  // Trigger aggregate recomputation
  await supabase.rpc('recompute_provider_verification', {
    p_provider_id: user.id,
  });

  // Emit domain event for verification status change
  await supabase.from('domain_events').insert({
    aggregate_type: 'provider_verification',
    aggregate_id: user.id,
    event_type: 'verification.status.changed',
    actor_id: user.id,
    payload: {
      provider_key: 'github',
      status: 'verified',
      handle,
    },
  });

  logger.info({
    userId: user.id,
    handle,
    externalAccountId,
    event: 'verification.github_verified_successfully',
  });

  redirectBase.searchParams.set('success', 'github_verified');
  return NextResponse.redirect(redirectBase);
}
