/**
 * Zero-decimal currencies per ISO 4217 standard (African and international)
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', // Burundian Franc
  'CLP', // Chilean Peso
  'DJF', // Djiboutian Franc
  'GNF', // Guinean Franc
  'JPY', // Japanese Yen
  'KMF', // Comorian Franc
  'KRW', // South Korean Won
  'MGA', // Malagasy Ariary
  'PYG', // Paraguayan Guaraní
  'RWF', // Rwandan Franc
  'UGX', // Ugandan Shilling
  'VND', // Vietnamese Dong
  'VUV', // Vanuatu Vatu
  'XAF', // Central African CFA Franc
  'XOF', // West African CFA Franc
  'XPF', // CFP Franc
]);

export function getCurrencyDecimalPlaces(currencyCode: string): number {
  const code = currencyCode.toUpperCase();
  return ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
}

/**
 * Converts minor integer units into main currency amount
 */
export function minorToMajor(amountMinor: number | bigint, currencyCode: string): number {
  const decimals = getCurrencyDecimalPlaces(currencyCode);
  const numeric = typeof amountMinor === 'bigint' ? Number(amountMinor) : amountMinor;
  if (decimals === 0) {
    return numeric;
  }
  return numeric / Math.pow(10, decimals);
}

/**
 * Converts major currency input to minor units
 */
export function majorToMinor(amountMajor: number, currencyCode: string): number {
  const decimals = getCurrencyDecimalPlaces(currencyCode);
  if (decimals === 0) {
    return Math.round(amountMajor);
  }
  return Math.round(amountMajor * Math.pow(10, decimals));
}

/**
 * Formats an indicative barter value.
 * Barter note: This is an indicative balancing value, not an upfront cash price.
 */
export function formatIndicativeValue(
  amountMinor: number | bigint | null | undefined,
  currencyCode: string = 'KES',
  locale: string = 'en'
): string {
  if (amountMinor === null || amountMinor === undefined) {
    return 'Trade by Agreement';
  }

  const majorAmount = minorToMajor(amountMinor, currencyCode);
  const decimals = getCurrencyDecimalPlaces(currencyCode);

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(majorAmount);
  } catch {
    // Fallback if currency code is unformatted
    return `${currencyCode.toUpperCase()} ${majorAmount.toLocaleString(locale)}`;
  }
}
