import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export type Country = Database['public']['Tables']['countries']['Row'];
export type Location = Database['public']['Tables']['locations']['Row'];

export async function getActiveCountries(): Promise<Country[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('countries')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error || !data) {
    return [];
  }
  return data;
}

export async function getLocationsByCountry(countryCode: string): Promise<Location[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('country_code', countryCode)
    .order('name');

  if (error || !data) {
    return [];
  }
  return data;
}
