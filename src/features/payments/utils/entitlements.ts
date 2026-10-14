import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { UserEntitlements } from '../types/payment.types';

export const FREE_BASELINE_ENTITLEMENTS: UserEntitlements = {
  plan_id: 'free',
  is_subscribed: false,
  in_grace: false,
  status: 'none',
  rank_bonus_days: 0,
  max_active_packages: 10,
  max_concurrent_top_ads: 1,
  analytics_level: 'basic',
  csv_export: false,
};

/**
 * Fetches user entitlements dynamically from the PostgreSQL get_entitlements engine.
 */
export async function getUserEntitlements(userId: string): Promise<UserEntitlements> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_entitlements', {
    p_user_id: userId,
  });

  if (error || !data) {
    return FREE_BASELINE_ENTITLEMENTS;
  }

  const res = data as Record<string, unknown>;

  return {
    plan_id: (res.plan_id as string) || 'free',
    is_subscribed: Boolean(res.is_subscribed),
    in_grace: Boolean(res.in_grace),
    status: (res.status as any) || 'none',
    rank_bonus_days: Number(res.rank_bonus_days || 0),
    max_active_packages: Number(res.max_active_packages || 10),
    max_concurrent_top_ads: Number(res.max_concurrent_top_ads || 1),
    analytics_level: (res.analytics_level as any) || 'basic',
    csv_export: Boolean(res.csv_export),
  };
}
