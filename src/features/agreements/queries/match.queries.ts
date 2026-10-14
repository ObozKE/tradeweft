import { createClient } from '@/lib/supabase/server';
import type { MutualMatchItem } from '../types/agreement.types';

/**
 * Calls the database RPC suggest_mutual_matches to discover providers where:
 * 1. Counterparty has packages in a category I am seeking
 * 2. I have packages in a category the counterparty is seeking
 * 3. Both in the same country
 * 4. No open negotiation already exists between the two users
 */
export async function getMutualMatches(
  limit: number = 20
): Promise<MutualMatchItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('suggest_mutual_matches', {
    p_limit: limit,
  });

  if (error || !data) {
    return [];
  }

  return (data as any[]).map((row) => ({
    counterpartyId: row.counterparty_id,
    displayName: row.display_name || 'Trade Partner',
    businessName: row.business_name || null,
    avatarUrl: row.avatar_url || null,
    cityName: row.city_name || null,
    areaName: row.area_name || null,
    matchStrength: row.match_strength || 1,
    myMatchingPackages: Array.isArray(row.my_matching_packages)
      ? row.my_matching_packages
      : [],
    theirMatchingPackages: Array.isArray(row.their_matching_packages)
      ? row.their_matching_packages
      : [],
  }));
}
