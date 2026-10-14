'use server';

import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { mediaUploadLimiter } from '@/lib/rate-limit';
import type { MediaKind } from '@/lib/supabase/database.types';

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PACKAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024; // 15 MB

export interface UploadIntentInput {
  kind: MediaKind;
  mime: string;
  bytes: number;
}

export interface UploadIntentResult {
  success?: boolean;
  error?: string;
  assetId?: string;
  path?: string;
  signedUploadUrl?: string;
  token?: string;
}

/**
 * Creates an upload intent for the two-stage media pipeline.
 * Reserves a pending media_assets row in quarantine and creates a signed PUT upload URL.
 */
export async function createUploadIntentAction(
  input: UploadIntentInput
): Promise<UploadIntentResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Authentication required to upload media.' };
  }

  // Rate Limiting (20 uploads per 5m)
  const limit = await mediaUploadLimiter.check(user.id);
  if (!limit.success) {
    logger.warn({ userId: user.id, event: 'rate_limit.hit', action: 'media.upload_intent' });
    return { error: 'You are uploading files too quickly. Please wait a few moments.' };
  }

  const { kind, mime, bytes } = input;

  if (!ALLOWED_MIMES.has(mime)) {
    return { error: 'Only JPEG, PNG, and WebP images are allowed. SVG and other formats are prohibited.' };
  }

  const maxAllowedBytes = kind === 'evidence' ? MAX_EVIDENCE_BYTES : MAX_PACKAGE_BYTES;
  if (bytes <= 0 || bytes > maxAllowedBytes) {
    const maxMb = maxAllowedBytes / (1024 * 1024);
    return { error: `File size exceeds the maximum limit of ${maxMb} MB.` };
  }

  const assetId = crypto.randomUUID();
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
  const quarantinePath = `${user.id}/${assetId}.${ext}`;

  // Insert pending row into media_assets (triggers enforce_media_asset_limits quota check)
  const { error: insertError } = await supabase.from('media_assets').insert({
    id: assetId,
    owner_id: user.id,
    kind,
    bucket: 'quarantine',
    path: quarantinePath,
    status: 'pending',
    mime,
    bytes,
  });

  if (insertError) {
    logger.error({ userId: user.id, error: insertError.message, event: 'media.intent_insert_failed' });
    if (insertError.message.includes('STORAGE_LIMIT_ASSETS')) {
      return { error: 'You have reached the maximum quota of 100 media assets.' };
    }
    if (insertError.message.includes('STORAGE_LIMIT_BYTES')) {
      return { error: 'You have reached your 200 MB storage quota.' };
    }
    return { error: 'Failed to initialize upload. Please try again.' };
  }

  // Create signed upload URL
  const { data: uploadData, error: signedUrlError } = await supabase.storage
    .from('quarantine')
    .createSignedUploadUrl(quarantinePath);

  if (signedUrlError) {
    logger.error({ userId: user.id, error: signedUrlError.message, event: 'media.signed_url_failed' });
    // Cleanup pending row
    await supabase.from('media_assets').delete().eq('id', assetId);
    return { error: 'Failed to generate secure upload credentials.' };
  }

  return {
    success: true,
    assetId,
    path: quarantinePath,
    signedUploadUrl: uploadData.signedUrl,
    token: uploadData.token,
  };
}
