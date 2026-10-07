/**
 * Trade Weft Per-Country Feature Flagging Engine
 *
 * Starts with static in-code configuration for Kenya launch.
 * Designed to transition seamlessly to a database-driven `country_features` table.
 */

export interface CountryFeatureFlags {
  /** Enables service listing creation and discovery */
  barterListings: boolean;
  /** Enables formal trade proposal workflow and contracts */
  barterAgreements: boolean;
  /** Enables public reviews and trust ledger calculations */
  trustLedger: boolean;
  /** Enables local mobile money escrow (e.g. M-Pesa in Kenya) */
  mobileMoneyEscrow: boolean;
  /** Enables national government ID verification checks */
  nationalIdVerification: boolean;
  /** Enables instant chat/messaging between participants */
  directMessaging: boolean;
}

const DEFAULT_FLAGS: CountryFeatureFlags = {
  barterListings: false,
  barterAgreements: false,
  trustLedger: false,
  mobileMoneyEscrow: false,
  nationalIdVerification: false,
  directMessaging: false,
};

const COUNTRY_FEATURE_MATRIX: Record<string, CountryFeatureFlags> = {
  // Kenya (Launch Country)
  KE: {
    barterListings: true,
    barterAgreements: true,
    trustLedger: true,
    mobileMoneyEscrow: true, // M-Pesa Daraja
    nationalIdVerification: true,
    directMessaging: true,
  },
  // Uganda (Planned)
  UG: {
    barterListings: false,
    barterAgreements: false,
    trustLedger: false,
    mobileMoneyEscrow: false, // MTN MoMo / Airtel Money
    nationalIdVerification: false,
    directMessaging: false,
  },
  // Tanzania (Planned)
  TZ: {
    barterListings: false,
    barterAgreements: false,
    trustLedger: false,
    mobileMoneyEscrow: false, // M-Pesa / Tigo Pesa
    nationalIdVerification: false,
    directMessaging: false,
  },
  // Nigeria (Planned)
  NG: {
    barterListings: false,
    barterAgreements: false,
    trustLedger: false,
    mobileMoneyEscrow: false, // Flutterwave / Paystack
    nationalIdVerification: false,
    directMessaging: false,
  },
};

/**
 * Returns the feature flags active for a specific country
 * @param countryCode ISO 3166-1 alpha-2 code (e.g., 'KE')
 */
export function getCountryFeatureFlags(countryCode: string): CountryFeatureFlags {
  const normalized = countryCode.toUpperCase();
  return COUNTRY_FEATURE_MATRIX[normalized] || DEFAULT_FLAGS;
}

/**
 * Convenience helper to verify if a single feature is enabled for a given country
 */
export function isFeatureEnabledForCountry(
  feature: keyof CountryFeatureFlags,
  countryCode: string
): boolean {
  const flags = getCountryFeatureFlags(countryCode);
  return Boolean(flags[feature]);
}
