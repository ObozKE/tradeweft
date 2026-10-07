import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];

/**
 * Requires an authenticated user verified via Supabase Auth server-side cryptographic check.
 * NEVER trust getSession() or client assertions.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  return { user, supabase };
}

/**
 * Requires an authenticated user who has completed onboarding.
 * If onboarding is incomplete, safely redirects to /onboarding.
 */
export async function requireOnboardedUser() {
  const { user, supabase } = await requireUser();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile || !profile.onboarding_completed_at) {
    redirect('/onboarding');
  }

  return { user, profile, supabase };
}

/**
 * Used on the /onboarding page.
 * If the user is already onboarded, redirect straight to /dashboard to prevent duplicate onboarding.
 */
export async function requirePendingOnboardingUser() {
  const { user, supabase } = await requireUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profile?.onboarding_completed_at) {
    redirect('/dashboard');
  }

  return { user, profile, supabase };
}
