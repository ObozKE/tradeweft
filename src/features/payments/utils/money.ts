import type { TaxBreakdown } from '../types/payment.types';

/**
 * Calculates tax and net breakdown using integer minor arithmetic.
 * taxRateBps is in basis points (e.g. 1600 bps = 16.00%).
 */
export function calculateTaxBreakdown(
  amountMinor: number,
  taxRateBps: number = 0,
  taxInclusive: boolean = true
): TaxBreakdown {
  const safeAmount = Number(amountMinor) || 0;
  const safeRate = Number(taxRateBps) || 0;

  if (safeAmount < 0) {
    throw new Error('Amount cannot be negative');
  }

  if (safeRate < 0) {
    throw new Error('Tax rate cannot be negative');
  }

  if (safeRate === 0) {
    return {
      netAmountMinor: safeAmount,
      taxAmountMinor: 0,
      grossAmountMinor: safeAmount,
      taxRateBps: 0,
      taxInclusive,
    };
  }

  if (taxInclusive) {
    // gross = net * (1 + rate) -> net = gross / (1 + rate)
    const netAmountMinor = Math.round((amountMinor * 10000) / (10000 + taxRateBps));
    const taxAmountMinor = amountMinor - netAmountMinor;

    return {
      netAmountMinor,
      taxAmountMinor,
      grossAmountMinor: amountMinor,
      taxRateBps,
      taxInclusive: true,
    };
  } else {
    // amountMinor is net; gross = net + tax
    const taxAmountMinor = Math.round((amountMinor * taxRateBps) / 10000);
    const grossAmountMinor = amountMinor + taxAmountMinor;

    return {
      netAmountMinor: amountMinor,
      taxAmountMinor,
      grossAmountMinor,
      taxRateBps,
      taxInclusive: false,
    };
  }
}

/**
 * Rounds up an amount to match the payment adapter's required amount granularity.
 * E.g., for Safaricom Daraja, STK Push requires whole KES (granularity 100 minor units).
 */
export function roundUpToGranularity(amountMinor: number, granularityMinor: number = 100): number {
  if (granularityMinor <= 0) return amountMinor;
  return Math.ceil(amountMinor / granularityMinor) * granularityMinor;
}

/**
 * Calculates deterministic integer prorated price difference for mid-cycle Boost upgrades.
 * Downgrades return 0 (downgrades take effect at period end).
 */
export function calculateProratedUpgradeDiff(
  currentPlanPriceMinor: number,
  newPlanPriceMinor: number,
  daysRemaining: number,
  totalCycleDays: number = 30,
  granularityMinor: number = 100
): number {
  if (newPlanPriceMinor <= currentPlanPriceMinor || daysRemaining <= 0) {
    return 0;
  }

  const clampedDays = Math.min(daysRemaining, totalCycleDays);
  const diffMinor = newPlanPriceMinor - currentPlanPriceMinor;
  const rawProrated = Math.round((diffMinor * clampedDays) / totalCycleDays);

  return roundUpToGranularity(rawProrated, granularityMinor);
}

/**
 * Formats integer minor money into human-readable currency.
 * E.g., 50000 minor units -> 'KES 500'
 */
export function formatMinorMoney(amountMinor: number, currencyCode: string = 'KES'): string {
  const major = amountMinor / 100;
  const hasDecimals = amountMinor % 100 !== 0;

  const formattedNumber = new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(major);

  return `${currencyCode} ${formattedNumber}`;
}
