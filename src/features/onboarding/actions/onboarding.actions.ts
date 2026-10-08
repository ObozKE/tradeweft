'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { onboardingFormSchema } from '../schemas/onboarding.schema';
import { onboardingLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export interface OnboardingActionState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  isSuccess?: boolean;
}

export async function submitOnboardingAction(
  prevState: OnboardingActionState | null,
  formData: FormData
): Promise<OnboardingActionState> {
  const supabase = await createClient();

  // 1. Strict Server Authorization Check (NO IDOR)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  // 2. Rate Limiting keyed by authenticated user ID
  const limit = await onboardingLimiter.check(user.id);
  if (!limit.success) {
    logger.warn({ userId: user.id, event: 'rate_limit.hit', action: 'onboarding' });
    return {
      error: 'Too many submissions. Please wait a few moments before trying again.',
    };
  }

  // 3. Extract and parse raw form inputs
  const rawData = {
    displayName: formData.get('displayName'),
    accountType: formData.get('accountType'),
    businessName: formData.get('businessName') || undefined,
    countryCode: formData.get('countryCode'),
    cityId: formData.get('cityId'),
    areaId: formData.get('areaId'),
    remoteDelivery: formData.get('remoteDelivery') === 'true' || formData.get('remoteDelivery') === 'on',
    termsAccepted: formData.get('termsAccepted') === 'true' || formData.get('termsAccepted') === 'on',
    termsVersion: formData.get('termsVersion') || 'v1.0-ke-2026',
  };

  const validation = onboardingFormSchema.safeParse(rawData);

  if (!validation.success) {
    const fieldErrors = validation.error.flatten().fieldErrors;
    return {
      error: 'Please review the highlighted fields below.',
      fieldErrors,
    };
  }

  const validData = validation.data;
  const now = new Date().toISOString();

  // 4. Update Profile in database with RLS enforced ownership
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      display_name: validData.displayName,
      account_type: validData.accountType,
      business_name: validData.businessName || null,
      country_code: validData.countryCode,
      city_id: validData.cityId,
      area_id: validData.areaId,
      remote_delivery: validData.remoteDelivery,
      terms_accepted_at: now,
      terms_version: validData.termsVersion,
      onboarding_completed_at: now,
      updated_at: now,
    })
    .eq('id', user.id);

  if (updateError) {
    // If the database has not yet been seeded with the locations table, retry without location FKs
    if (updateError.message.toLowerCase().includes('foreign key') || updateError.message.toLowerCase().includes('fkey')) {
      logger.warn(
        { userId: user.id, error: updateError.message },
        'Location FK missing in database. Retrying profile update without location FKs.'
      );
      const { error: retryError } = await supabase
        .from('profiles')
        .update({
          display_name: validData.displayName,
          account_type: validData.accountType,
          business_name: validData.businessName || null,
          remote_delivery: validData.remoteDelivery,
          terms_accepted_at: now,
          terms_version: validData.termsVersion,
          onboarding_completed_at: now,
          updated_at: now,
        })
        .eq('id', user.id);

      if (retryError) {
        logger.error(
          { userId: user.id, error: retryError.message, event: 'onboarding.failed' },
          'Failed to update profile during onboarding retry'
        );
        return {
          error: 'A database error occurred while saving your profile. Please try again.',
        };
      }
    } else {
      logger.error(
        { userId: user.id, error: updateError.message, event: 'onboarding.failed' },
        'Failed to update profile during onboarding'
      );
      return {
        error: 'A database error occurred while saving your profile. Please try again.',
      };
    }
  }

  logger.info(
    {
      userId: user.id,
      country: validData.countryCode,
      accountType: validData.accountType,
      event: 'onboarding.completed',
    },
    'User successfully completed onboarding'
  );

  revalidatePath('/dashboard');
  redirect('/dashboard');
}
