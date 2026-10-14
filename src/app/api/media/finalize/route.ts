import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { sniffMagicBytes } from '@/features/media/utils/magic-bytes';
import {
  processEvidenceImage,
  processPackageImage,
} from '@/features/media/utils/image-processor';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: { assetId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { assetId } = body;
  if (!assetId || typeof assetId !== 'string') {
    return NextResponse.json({ error: 'assetId is required' }, { status: 400 });
  }

  // 1. Fetch pending asset record owned by this user
  const { data: asset, error: fetchError } = await supabase
    .from('media_assets')
    .select('*')
    .eq('id', assetId)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (fetchError || !asset) {
    return NextResponse.json({ error: 'Media asset not found' }, { status: 404 });
  }

  if (asset.status !== 'pending' || asset.bucket !== 'quarantine') {
    return NextResponse.json(
      { error: `Asset is not in pending quarantine status (current status: ${asset.status})` },
      { status: 400 }
    );
  }

  // 2. Download quarantined file buffer
  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from('quarantine')
    .download(asset.path);

  if (downloadError || !fileBlob) {
    logger.error({
      userId: user.id,
      assetId,
      error: downloadError?.message,
      event: 'media.quarantine_download_failed',
    });
    return NextResponse.json({ error: 'Quarantined file could not be retrieved' }, { status: 500 });
  }

  const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());

  // 3. Magic-Byte Sniffing
  const sniff = sniffMagicBytes(fileBuffer);
  if (!sniff.valid) {
    logger.warn({
      userId: user.id,
      assetId,
      sniffError: sniff.error,
      event: 'media.magic_bytes_rejected',
    });

    await supabase
      .from('media_assets')
      .update({
        status: 'rejected',
        rejection_code: 'MAGIC_BYTES_INVALID',
        updated_at: new Date().toISOString(),
      })
      .eq('id', assetId);

    await supabase.storage.from('quarantine').remove([asset.path]);
    return NextResponse.json({ error: sniff.error || 'Invalid file format' }, { status: 400 });
  }

  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const now = new Date().toISOString();

  // 4. Sharp Processing Pipeline
  try {
    if (asset.kind === 'evidence') {
      const processed = await processEvidenceImage(fileBuffer);
      const targetPath = `${user.id}/${asset.id}.webp`;

      // Upload to private evidence bucket
      const { error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(targetPath, processed.buffer, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Evidence upload failed: ${uploadError.message}`);
      }

      // Cleanup quarantine
      await supabase.storage.from('quarantine').remove([asset.path]);

      // Update media_assets row to ready
      await supabase
        .from('media_assets')
        .update({
          bucket: 'evidence',
          path: targetPath,
          status: 'ready',
          mime: 'image/webp',
          bytes: processed.bytes,
          width: processed.width,
          height: processed.height,
          sha256,
          updated_at: now,
        })
        .eq('id', asset.id);

      logger.info({
        userId: user.id,
        assetId: asset.id,
        kind: asset.kind,
        event: 'media.evidence_finalized',
      });

      return NextResponse.json({
        success: true,
        assetId: asset.id,
        status: 'ready',
      });
    } else {
      // Package Cover or Gallery
      const processed = await processPackageImage(fileBuffer);
      const fullPath = `packages/${asset.id}/full.webp`;
      const thumbPath = `packages/${asset.id}/thumb.webp`;

      // Upload variants to public-media bucket
      const { error: fullError } = await supabase.storage
        .from('public-media')
        .upload(fullPath, processed.fullBuffer, {
          contentType: 'image/webp',
          upsert: true,
        });
      if (fullError) throw new Error(`Full variant upload failed: ${fullError.message}`);

      const { error: thumbError } = await supabase.storage
        .from('public-media')
        .upload(thumbPath, processed.thumbBuffer, {
          contentType: 'image/webp',
          upsert: true,
        });
      if (thumbError) throw new Error(`Thumb variant upload failed: ${thumbError.message}`);

      // Cleanup quarantine
      await supabase.storage.from('quarantine').remove([asset.path]);

      // Update media_assets row to ready with variants and blur placeholder
      await supabase
        .from('media_assets')
        .update({
          bucket: 'public-media',
          path: fullPath,
          status: 'ready',
          mime: 'image/webp',
          bytes: processed.bytes,
          width: processed.width,
          height: processed.height,
          sha256,
          blur_data_url: processed.blurDataUrl,
          variants: {
            full: fullPath,
            thumb: thumbPath,
          },
          updated_at: now,
        })
        .eq('id', asset.id);

      logger.info({
        userId: user.id,
        assetId: asset.id,
        kind: asset.kind,
        event: 'media.package_image_finalized',
      });

      return NextResponse.json({
        success: true,
        assetId: asset.id,
        status: 'ready',
        blurDataUrl: processed.blurDataUrl,
      });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Processing failed';
    logger.error({
      userId: user.id,
      assetId,
      error: errorMsg,
      event: 'media.processing_failed',
    });

    await supabase
      .from('media_assets')
      .update({
        status: 'rejected',
        rejection_code: errorMsg.slice(0, 100),
        updated_at: now,
      })
      .eq('id', assetId);

    await supabase.storage.from('quarantine').remove([asset.path]);
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }
}
