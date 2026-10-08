'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { servicePackageInputSchema, type PackageStatus } from '../schemas/package.schema';
import { packageActionLimiter, publishLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';

export interface PackageActionState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
  packageId?: string;
}

/**
 * Creates or updates a service package with optimistic concurrency control.
 */
export async function saveServicePackageAction(
  prevState: PackageActionState | null,
  formData: FormData
): Promise<PackageActionState> {
  const supabase = await createClient();

  // 1. Strict Server Authorization Check (NO IDOR)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  // 2. Rate Limiting per User
  const limit = await packageActionLimiter.check(user.id);
  if (!limit.success) {
    logger.warn({ userId: user.id, event: 'rate_limit.hit', action: 'package.save' });
    return { error: 'Too many requests. Please wait a moment before saving again.' };
  }

  // 3. Extract and parse form inputs
  const rawDeliverables = formData.getAll('deliverables') as string[];
  const rawExclusions = formData.getAll('exclusions') as string[];
  const rawSeeking = formData.getAll('seekingCategories') as string[];

  const rawData = {
    id: formData.get('id') ? String(formData.get('id')) : undefined,
    title: formData.get('title'),
    summary: formData.get('summary'),
    description: formData.get('description'),
    categoryId: formData.get('categoryId'),
    deliveryMode: formData.get('deliveryMode'),
    countryCode: formData.get('countryCode') || 'KE',
    cityId: formData.get('cityId') || null,
    areaId: formData.get('areaId') || null,
    turnaroundDays: formData.get('turnaroundDays'),
    capacityPerMonth: formData.get('capacityPerMonth') ? Number(formData.get('capacityPerMonth')) : null,
    indicativeValueMinor: formData.get('indicativeValueMinor') ? Number(formData.get('indicativeValueMinor')) : null,
    currencyCode: formData.get('currencyCode') || 'KES',
    deliverables: rawDeliverables.filter((d) => Boolean(d && d.trim())),
    exclusions: rawExclusions.filter((e) => Boolean(e && e.trim())),
    seekingCategoryIds: rawSeeking.filter(Boolean),
    expectedUpdatedAt: formData.get('expectedUpdatedAt') ? String(formData.get('expectedUpdatedAt')) : undefined,
  };

  const validation = servicePackageInputSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: 'Please review the highlighted fields below.',
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const data = validation.data;
  const isEditing = Boolean(data.id);

  // 4. Optimistic Concurrency Check (If editing existing package)
  if (isEditing && data.id) {
    const { data: current, error: fetchError } = await supabase
      .from('service_packages')
      .select('provider_id, updated_at, status')
      .eq('id', data.id)
      .single();

    if (fetchError || !current) {
      return { error: 'The package you are trying to edit could not be found.' };
    }

    if (current.provider_id !== user.id) {
      logger.warn({ userId: user.id, packageId: data.id, event: 'idor.prevented' });
      return { error: 'You do not have permission to modify this package.' };
    }

    if (data.expectedUpdatedAt && current.updated_at !== data.expectedUpdatedAt) {
      logger.info({ userId: user.id, packageId: data.id, event: 'package.concurrency_conflict' });
      return {
        error: 'This package was updated in another window. Please reload the page to load the latest version.',
      };
    }
  }

  // 5. Database Mutation
  let packageId = data.id;

  if (isEditing && packageId) {
    const { error: updateError } = await supabase
      .from('service_packages')
      .update({
        title: data.title,
        summary: data.summary,
        description: data.description,
        category_id: data.categoryId,
        delivery_mode: data.deliveryMode,
        country_code: data.countryCode,
        city_id: data.cityId || null,
        area_id: data.areaId || null,
        turnaround_days: data.turnaroundDays,
        capacity_per_month: data.capacityPerMonth ?? null,
        indicative_value_minor: data.indicativeValueMinor ?? null,
        currency_code: data.currencyCode,
        deliverables: data.deliverables,
        exclusions: data.exclusions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', packageId)
      .eq('provider_id', user.id);

    if (updateError) {
      logger.error({ userId: user.id, error: updateError.message, event: 'package.update_failed' });
      return { error: 'A database error occurred while updating the package.' };
    }

    logger.info({ userId: user.id, packageId, event: 'package.updated' });
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('service_packages')
      .insert({
        provider_id: user.id,
        category_id: data.categoryId,
        status: 'draft',
        title: data.title,
        summary: data.summary,
        description: data.description,
        delivery_mode: data.deliveryMode,
        country_code: data.countryCode,
        city_id: data.cityId || null,
        area_id: data.areaId || null,
        turnaround_days: data.turnaroundDays,
        capacity_per_month: data.capacityPerMonth ?? null,
        indicative_value_minor: data.indicativeValueMinor ?? null,
        currency_code: data.currencyCode,
        deliverables: data.deliverables,
        exclusions: data.exclusions,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      logger.error({ userId: user.id, error: insertError?.message, event: 'package.create_failed' });
      return { error: 'Failed to create service package. Please try again.' };
    }

    packageId = inserted.id;
    logger.info({ userId: user.id, packageId, event: 'package.created' });
  }

  // 6. Synchronize Seeking Categories
  if (packageId) {
    // Delete existing seeking categories
    await supabase
      .from('service_package_seeking_categories')
      .delete()
      .eq('package_id', packageId);

    // Insert new seeking categories
    if (data.seekingCategoryIds && data.seekingCategoryIds.length > 0) {
      const seekingRows = data.seekingCategoryIds.map((catId) => ({
        package_id: packageId,
        category_id: catId,
      }));
      await supabase.from('service_package_seeking_categories').insert(seekingRows);
    }
  }

  revalidatePath('/dashboard/packages');
  if (packageId) {
    revalidateTag(`package:${packageId}`, 'max-age=0');
  }

  redirect('/dashboard/packages');
}

/**
 * Publishes a draft or paused service package atomically via Postgres RPC.
 */
export async function publishServicePackageAction(packageId: string): Promise<PackageActionState> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  // Strict Rate Limiting on Publishing
  const limit = await publishLimiter.check(user.id);
  if (!limit.success) {
    logger.warn({ userId: user.id, event: 'rate_limit.hit', action: 'package.publish' });
    return { error: 'Too many publish requests. Please wait a moment and try again.' };
  }

  const { data: rpcRes, error: rpcError } = await supabase.rpc('publish_service_package', {
    p_package_id: packageId,
  });

  if (rpcError) {
    logger.error({ userId: user.id, packageId, error: rpcError.message, event: 'package.publish_failed' });

    if (rpcError.message.includes('ONBOARDING_REQUIRED')) {
      return { error: 'You must complete your profile onboarding before publishing packages.' };
    }
    if (rpcError.message.includes('LIMIT_EXCEEDED')) {
      return { error: 'Active package limit reached. You can have a maximum of 10 active packages.' };
    }
    if (rpcError.message.includes('FORBIDDEN')) {
      return { error: 'You do not have permission to publish this package.' };
    }
    return { error: 'Failed to publish package. Please check that all required fields are complete.' };
  }

  logger.info({ userId: user.id, packageId, event: 'package.published' });

  revalidatePath('/dashboard/packages');
  revalidatePath('/explore');
  revalidateTag(`package:${packageId}`, 'max-age=0');

  return { success: true, packageId };
}

/**
 * Changes a package's status to paused or archived.
 */
export async function setPackageStatusAction(
  packageId: string,
  status: 'paused' | 'archived'
): Promise<PackageActionState> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const limit = await packageActionLimiter.check(user.id);
  if (!limit.success) {
    return { error: 'Too many requests. Please wait a moment.' };
  }

  const { error: rpcError } = await supabase.rpc('set_service_package_status', {
    p_package_id: packageId,
    p_status: status,
  });

  if (rpcError) {
    logger.error({ userId: user.id, packageId, status, error: rpcError.message, event: 'package.status_failed' });
    return { error: 'Failed to update package status. Please try again.' };
  }

  logger.info({ userId: user.id, packageId, status, event: `package.${status}` });

  revalidatePath('/dashboard/packages');
  revalidatePath('/explore');
  revalidateTag(`package:${packageId}`, 'max-age=0');

  return { success: true, packageId };
}

/**
 * Deletes a draft service package (hard-delete allowed strictly on drafts).
 */
export async function deleteDraftPackageAction(packageId: string): Promise<PackageActionState> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const { error: rpcError } = await supabase.rpc('delete_service_package', {
    p_package_id: packageId,
  });

  if (rpcError) {
    logger.error({ userId: user.id, packageId, error: rpcError.message, event: 'package.delete_failed' });
    return { error: 'Only drafts can be deleted. Published packages must be archived.' };
  }

  logger.info({ userId: user.id, packageId, event: 'package.deleted' });

  revalidatePath('/dashboard/packages');
  return { success: true, packageId };
}
