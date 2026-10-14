'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const attachPackageMediaSchema = z.object({
  packageId: z.string().uuid(),
  assetId: z.string().uuid(),
  altText: z.string().min(1, 'Alt text is required for accessibility.').max(150, 'Alt text cannot exceed 150 characters.'),
  isCover: z.boolean().default(false),
  position: z.number().int().min(0).max(4).default(0),
});

export interface MediaActionResult {
  success?: boolean;
  error?: string;
}

/**
 * Attaches a processed media asset to a service package with accessibility alt text.
 */
export async function attachPackageMediaAction(
  data: z.infer<typeof attachPackageMediaSchema>
): Promise<MediaActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Authentication required.' };
  }

  const validation = attachPackageMediaSchema.safeParse(data);
  if (!validation.success) {
    return { error: validation.error.issues[0]?.message || 'Invalid input.' };
  }

  const { packageId, assetId, altText, isCover, position } = validation.data;

  // 1. Verify package ownership
  const { data: pkg, error: pkgError } = await supabase
    .from('service_packages')
    .select('id, provider_id')
    .eq('id', packageId)
    .maybeSingle();

  if (pkgError || !pkg || pkg.provider_id !== user.id) {
    return { error: 'Service package not found or unauthorized.' };
  }

  // 2. Verify asset ownership and readiness
  const { data: asset, error: assetError } = await supabase
    .from('media_assets')
    .select('id, owner_id, status, kind')
    .eq('id', assetId)
    .maybeSingle();

  if (assetError || !asset || asset.owner_id !== user.id) {
    return { error: 'Media asset not found or unauthorized.' };
  }

  if (asset.status !== 'ready') {
    return { error: 'Media asset is not yet processed.' };
  }

  // 3. Check limit: max 5 images per package
  const { count, error: countError } = await supabase
    .from('package_media')
    .select('*', { count: 'exact', head: true })
    .eq('package_id', packageId);

  if (countError) {
    return { error: 'Failed to check package media count.' };
  }

  if ((count || 0) >= 5) {
    return { error: 'Maximum of 5 images per service package reached (1 cover + 4 gallery).' };
  }

  // If this is marked as cover, reset any existing cover
  if (isCover) {
    await supabase
      .from('package_media')
      .update({ is_cover: false })
      .eq('package_id', packageId);
  }

  const { error: insertError } = await supabase.from('package_media').insert({
    package_id: packageId,
    asset_id: assetId,
    alt_text: altText,
    is_cover: isCover,
    position,
  });

  if (insertError) {
    logger.error({
      userId: user.id,
      packageId,
      assetId,
      error: insertError.message,
      event: 'packages.attach_media_failed',
    });
    return { error: 'Failed to attach image to package.' };
  }

  revalidatePath('/dashboard/packages');
  revalidatePath(`/dashboard/packages/${packageId}`);

  return { success: true };
}

/**
 * Removes an attached media asset from a service package.
 */
export async function removePackageMediaAction(
  packageId: string,
  assetId: string
): Promise<MediaActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Authentication required.' };
  }

  // Verify package ownership
  const { data: pkg } = await supabase
    .from('service_packages')
    .select('id, provider_id')
    .eq('id', packageId)
    .maybeSingle();

  if (!pkg || pkg.provider_id !== user.id) {
    return { error: 'Unauthorized.' };
  }

  const { error: deleteError } = await supabase
    .from('package_media')
    .delete()
    .eq('package_id', packageId)
    .eq('asset_id', assetId);

  if (deleteError) {
    return { error: 'Failed to remove media from package.' };
  }

  revalidatePath('/dashboard/packages');
  revalidatePath(`/dashboard/packages/${packageId}`);

  return { success: true };
}

/**
 * Sets a specific image as the cover image for a package.
 */
export async function setPackageCoverMediaAction(
  packageId: string,
  assetId: string
): Promise<MediaActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Authentication required.' };
  }

  // Verify package ownership
  const { data: pkg } = await supabase
    .from('service_packages')
    .select('id, provider_id')
    .eq('id', packageId)
    .maybeSingle();

  if (!pkg || pkg.provider_id !== user.id) {
    return { error: 'Unauthorized.' };
  }

  // Reset other covers
  await supabase
    .from('package_media')
    .update({ is_cover: false })
    .eq('package_id', packageId);

  // Set target cover
  const { error } = await supabase
    .from('package_media')
    .update({ is_cover: true })
    .eq('package_id', packageId)
    .eq('asset_id', assetId);

  if (error) {
    return { error: 'Failed to set cover image.' };
  }

  revalidatePath('/dashboard/packages');
  revalidatePath(`/dashboard/packages/${packageId}`);

  return { success: true };
}
