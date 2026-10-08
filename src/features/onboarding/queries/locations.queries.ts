import 'server-only';
import { createClient } from '@/lib/supabase/server';
import {
  type Country,
  type Location,
  FALLBACK_COUNTRIES,
  FALLBACK_LOCATIONS,
} from '../data/locations.constants';

export type { Country, Location };
export { FALLBACK_COUNTRIES, FALLBACK_LOCATIONS };

export async function getActiveCountries(): Promise<Country[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('countries')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error || !data || data.length === 0) {
      return FALLBACK_COUNTRIES;
    }
    return data;
  } catch {
    return FALLBACK_COUNTRIES;
  }
}

export async function getLocationsByCountry(countryCode: string): Promise<Location[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('country_code', countryCode)
      .order('name');

    if (error || !data || data.length === 0) {
      return FALLBACK_LOCATIONS.filter((l) => l.country_code === countryCode);
    }
    return data;
  } catch {
    return FALLBACK_LOCATIONS.filter((l) => l.country_code === countryCode);
  }
}
