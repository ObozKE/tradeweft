import 'server-only';
import { redirect, notFound } from 'next/navigation';
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

/**
 * Requires an authenticated user with verifier or admin role.
 * Emits a 404 notFound() for unauthorized users to prevent endpoint enumeration.
 */
export async function requireVerifierOrAdmin() {
  const { user, supabase } = await requireUser();

  const { data: roleRecords } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  const roles = (roleRecords || []).map((r) => r.role);
  const isAuthorized = roles.includes('verifier') || roles.includes('admin');

  if (!isAuthorized) {
    notFound();
  }

  return { user, supabase, roles };
}

/**
 * Requires an authenticated user with finance or admin role.
 * Emits a 404 notFound() for unauthorized users to prevent endpoint enumeration.
 */
export async function requireFinanceOrAdmin() {
  const { user, supabase } = await requireUser();

  const { data: roleRecords } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  const roles = (roleRecords || []).map((r) => r.role);
  const isAuthorized = roles.includes('finance') || roles.includes('admin');

  if (!isAuthorized) {
    notFound();
  }

  return { user, supabase, roles };
}

/**
 * Requires an authenticated user with staff access (verifier, finance, or admin).
 * Emits 404 notFound() for unauthorized users.
 */
export async function requireStaffUser() {
  const { user, supabase } = await requireUser();

  const { data: roleRecords } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  const roles = (roleRecords || []).map((r) => r.role);
  const isAuthorized =
    roles.includes('verifier') || roles.includes('finance') || roles.includes('admin');

  if (!isAuthorized) {
    notFound();
  }

  return { user, supabase, roles };
}


