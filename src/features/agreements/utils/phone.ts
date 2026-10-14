import { parsePhoneNumber, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js';

export interface PhoneValidationResult {
  isValid: boolean;
  e164: string | null;
  formattedNational: string | null;
  country: CountryCode | null;
  error?: string;
}

/**
 * Validates and normalizes user phone number to standard E.164.
 * Default country is Kenya (KE, +254) for launch.
 */
export function validateAndFormatPhone(
  rawPhone: string | null | undefined,
  defaultCountry: CountryCode = 'KE'
): PhoneValidationResult {
  if (!rawPhone || !rawPhone.trim()) {
    return {
      isValid: false,
      e164: null,
      formattedNational: null,
      country: null,
      error: 'Phone number is required',
    };
  }

  const clean = rawPhone.trim();

  try {
    if (!isValidPhoneNumber(clean, defaultCountry)) {
      return {
        isValid: false,
        e164: null,
        formattedNational: null,
        country: null,
        error: 'Please enter a valid phone number (e.g. 0712 345 678 or +254 712 345 678)',
      };
    }

    const parsed = parsePhoneNumber(clean, defaultCountry);
    return {
      isValid: true,
      e164: parsed.number, // E.164: +254712345678
      formattedNational: parsed.formatNational(),
      country: parsed.country || defaultCountry,
    };
  } catch {
    return {
      isValid: false,
      e164: null,
      formattedNational: null,
      country: null,
      error: 'Invalid phone number format',
    };
  }
}
