'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import {
  verificationLinkLimiter,
  verificationDomainLimiter,
} from '@/lib/rate-limit';
import {
  addPortfolioLinkSchema,
  submitManualEvidenceSchema,
  deletePortfolioLinkSchema,
  verifyDomainSchema,
} from '../schemas/link.schema';
import {
  PLATFORM_REGISTRY,
  validateUrlForPlatform,
  generateChallengeCode,
} from '../providers/registry';
import { normalizePortfolioUrl } from '../utils/url-hygiene';
import { verifyDomainOwnership } from '../utils/domain-verifier';
import type {
  VerificationActionResult,
  VerificationStatus,
} from '../types/verification.types';

/**
 * Submits a new portfolio link for ownership verification.
 */
export async function addPortfolioLinkAction(
  prevState: VerificationActionResult | null,
  formData: FormData
): Promise<VerificationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  // Rate Limiting (10 requests per 5 min)
  const limit = await verificationLinkLimiter.check(user.id);
  if (!limit.success) {
    logger.warn({ userId: user.id, event: 'rate_limit.hit', action: 'verification.add_link' });
    return {
      error: 'You have added multiple links recently. Please wait a few moments before trying again.',
    };
  }

  const rawData = {
    providerKey: formData.get('providerKey') as string,
    url: formData.get('url') as string,
  };

  const validation = addPortfolioLinkSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: 'Please check your input.',
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { providerKey, url: rawUrl } = validation.data;
  const platform = PLATFORM_REGISTRY[providerKey];
  if (!platform) {
    return { error: 'Unsupported verification platform.' };
  }

  // URL Hygiene & Normalization
  const hygiene = normalizePortfolioUrl(rawUrl);
  if (!hygiene.valid || !hygiene.parsedUrl || !hygiene.normalizedUrl) {
    return { error: hygiene.error || 'Invalid portfolio URL provided.' };
  }

  // Platform-specific validation
  const platformValidation = validateUrlForPlatform(platform, hygiene.parsedUrl);
  if (!platformValidation.valid) {
    return { error: platformValidation.error || 'URL does not match platform rules.' };
  }

  const handle = platform.extractHandle(hygiene.parsedUrl);
  const canonicalUrl = platform.normalizeUrl(hygiene.parsedUrl);

  // Generate challenge code for manual review or domain proof
  let challengeCode: string | null = null;
  if (platform.method === 'manual' || platform.method === 'domain') {
    challengeCode = generateChallengeCode();
  }

  const idempotencyKey = crypto.randomUUID();

  const { data: rpcData, error: rpcError } = await supabase.rpc('create_portfolio_link', {
    p_provider_key: providerKey,
    p_url: hygiene.normalizedUrl,
    p_canonical_url: canonicalUrl,
    p_method: platform.method,
    p_handle: handle,
    p_challenge_code: challengeCode,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcError) {
    logger.error({ userId: user.id, error: rpcError.message, event: 'verification.create_link_failed' });

    if (rpcError.message.includes('MAX_LINKS_REACHED')) {
      return { error: 'You have reached the maximum quota of 10 portfolio links.' };
    }
    if (rpcError.message.includes('DUPLICATE_URL')) {
      return { error: 'You have already added this portfolio link.' };
    }
    if (rpcError.message.includes('ACCOUNT_ALREADY_VERIFIED')) {
      return { error: 'This external account has already been verified by another member.' };
    }
    return { error: 'Failed to add portfolio link. Please try again.' };
  }

  const res = rpcData as {
    link_id?: string;
    status?: VerificationStatus;
    challenge_code?: string;
  };

  logger.info({
    userId: user.id,
    linkId: res?.link_id,
    providerKey,
    method: platform.method,
    event: 'verification.link_created',
  });

  revalidatePath('/dashboard/profile');
  revalidatePath('/dashboard/verification');

  return {
    success: true,
    linkId: res?.link_id,
    challengeCode: res?.challenge_code ?? challengeCode ?? undefined,
    status: res?.status,
  };
}

/**
 * Submits screenshot evidence for a manual verification challenge.
 */
export async function submitManualEvidenceAction(
  prevState: VerificationActionResult | null,
  formData: FormData
): Promise<VerificationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const rawData = {
    linkId: formData.get('linkId') as string,
    evidenceAssetId: formData.get('evidenceAssetId') as string,
  };

  const validation = submitManualEvidenceSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: 'Invalid evidence submission.',
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { linkId, evidenceAssetId } = validation.data;
  const idempotencyKey = crypto.randomUUID();

  const { data: rpcData, error: rpcError } = await supabase.rpc('submit_manual_evidence', {
    p_link_id: linkId,
    p_evidence_asset_id: evidenceAssetId,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcError) {
    logger.error({ userId: user.id, error: rpcError.message, event: 'verification.submit_evidence_failed' });

    if (rpcError.message.includes('NOT_FOUND')) {
      return { error: 'Portfolio link not found.' };
    }
    if (rpcError.message.includes('FORBIDDEN')) {
      return { error: 'You are not authorized to submit evidence for this link.' };
    }
    if (rpcError.message.includes('INVALID_STATUS')) {
      return { error: 'Evidence can only be submitted for links awaiting proof or previously rejected.' };
    }
    if (rpcError.message.includes('ASSET_NOT_READY')) {
      return { error: 'Evidence screenshot is still processing or invalid. Please re-upload.' };
    }
    return { error: 'Failed to submit evidence. Please try again.' };
  }

  const res = rpcData as { link_id?: string; status?: VerificationStatus };

  logger.info({
    userId: user.id,
    linkId,
    event: 'verification.evidence_submitted',
  });

  revalidatePath('/dashboard/profile');
  revalidatePath('/dashboard/verification');

  return {
    success: true,
    linkId: res?.link_id ?? linkId,
    status: res?.status,
  };
}

/**
 * Deletes an external portfolio link owned by the authenticated provider.
 */
export async function deletePortfolioLinkAction(
  linkId: string
): Promise<VerificationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const validation = deletePortfolioLinkSchema.safeParse({ linkId });
  if (!validation.success) {
    return { error: 'Invalid link identifier.' };
  }

  const { error: deleteError } = await supabase
    .from('portfolio_links')
    .delete()
    .eq('id', linkId)
    .eq('user_id', user.id);

  if (deleteError) {
    logger.error({ userId: user.id, error: deleteError.message, event: 'verification.delete_link_failed' });
    return { error: 'Failed to delete portfolio link.' };
  }

  // Trigger recomputation of provider verification aggregate
  await supabase.rpc('recompute_provider_verification', {
    p_provider_id: user.id,
  });

  logger.info({
    userId: user.id,
    linkId,
    event: 'verification.link_deleted',
  });

  revalidatePath('/dashboard/profile');
  revalidatePath('/dashboard/verification');

  return { success: true };
}

/**
 * Triggers automated domain ownership verification via meta tag or /.well-known file.
 */
export async function verifyDomainAction(
  linkId: string
): Promise<VerificationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const validation = verifyDomainSchema.safeParse({ linkId });
  if (!validation.success) {
    return { error: 'Invalid link identifier.' };
  }

  // Rate Limiting (5 domain verification attempts per 5m)
  const limit = await verificationDomainLimiter.check(user.id);
  if (!limit.success) {
    logger.warn({ userId: user.id, event: 'rate_limit.hit', action: 'verification.domain_check' });
    return {
      error: 'You have triggered several domain checks recently. Please wait a few moments before trying again.',
    };
  }

  const { data: link, error: linkError } = await supabase
    .from('portfolio_links')
    .select('*')
    .eq('id', linkId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (linkError || !link) {
    return { error: 'Portfolio link not found.' };
  }

  if (link.method !== 'domain') {
    return { error: 'This portfolio link does not use domain verification.' };
  }

  if (!link.challenge_code) {
    return { error: 'No verification challenge code associated with this link.' };
  }

  const verifyResult = await verifyDomainOwnership(link.canonical_url, link.challenge_code);

  const now = new Date().toISOString();

  if (verifyResult.verified) {
    const { error: updateError } = await supabase
      .from('portfolio_links')
      .update({
        status: 'verified',
        verified_at: now,
        last_checked_at: now,
        reject_reason: null,
        reject_note: null,
        updated_at: now,
      })
      .eq('id', link.id);

    if (updateError) {
      logger.error({ userId: user.id, error: updateError.message, event: 'verification.domain_update_failed' });
      return { error: 'Failed to update link verification status.' };
    }

    // Trigger aggregate recomputation
    await supabase.rpc('recompute_provider_verification', {
      p_provider_id: user.id,
    });

    // Emit domain event
    await supabase.from('domain_events').insert({
      aggregate_type: 'provider_verification',
      aggregate_id: user.id,
      event_type: 'verification.status.changed',
      actor_id: user.id,
      payload: {
        link_id: link.id,
        provider_key: link.provider_key,
        status: 'verified',
        method: verifyResult.method,
      },
    });

    logger.info({
      userId: user.id,
      linkId: link.id,
      method: verifyResult.method,
      event: 'verification.domain_verified',
    });

    revalidatePath('/dashboard/profile');
    revalidatePath('/dashboard/verification');

    return {
      success: true,
      linkId: link.id,
      status: 'verified',
    };
  } else {
    // Record check timestamp
    await supabase
      .from('portfolio_links')
      .update({ last_checked_at: now })
      .eq('id', link.id);

    return {
      error:
        verifyResult.error ||
        'Could not verify domain ownership. Please ensure your meta tag or /.well-known file is published correctly and try again.',
    };
  }
}

