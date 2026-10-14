import { formatIndicativeValue } from '@/features/packages/utils/currency';

export type BalanceStatus =
  | 'about_even'
  | 'tilted_toward_you'
  | 'tilted_toward_them'
  | 'incomplete';

export interface BalanceEvaluation {
  status: BalanceStatus;
  label: string;
  myTotalMinor: number | null;
  theirTotalMinor: number | null;
  formattedMyTotal: string;
  formattedTheirTotal: string;
  differencePercentage: number | null;
}

export interface ValuedLine {
  indicativeValueMinor: number | null;
  quantity: number;
}

/**
 * Computes the advisory barter balance between two sides.
 * @param myLines Lines offered by current viewer
 * @param theirLines Lines offered by counterparty
 * @param currencyCode Currency code (e.g. KES, UGX)
 * @param locale Locale for formatting
 */
export function calculateTradeBalance(
  myLines: ValuedLine[],
  theirLines: ValuedLine[],
  currencyCode: string = 'KES',
  locale: string = 'en'
): BalanceEvaluation {
  let myIncomplete = false;
  let theirIncomplete = false;

  let myTotal = 0;
  for (const line of myLines) {
    if (line.indicativeValueMinor === null || line.indicativeValueMinor === undefined) {
      myIncomplete = true;
    } else {
      myTotal += line.indicativeValueMinor * line.quantity;
    }
  }

  let theirTotal = 0;
  for (const line of theirLines) {
    if (line.indicativeValueMinor === null || line.indicativeValueMinor === undefined) {
      theirIncomplete = true;
    } else {
      theirTotal += line.indicativeValueMinor * line.quantity;
    }
  }

  const formattedMy = myIncomplete
    ? 'Value not set'
    : formatIndicativeValue(myTotal, currencyCode, locale);
  const formattedTheir = theirIncomplete
    ? 'Value not set'
    : formatIndicativeValue(theirTotal, currencyCode, locale);

  if (myIncomplete || theirIncomplete) {
    return {
      status: 'incomplete',
      label: 'Value not set on one or more packages (advisory only)',
      myTotalMinor: myIncomplete ? null : myTotal,
      theirTotalMinor: theirIncomplete ? null : theirTotal,
      formattedMyTotal: formattedMy,
      formattedTheirTotal: formattedTheir,
      differencePercentage: null,
    };
  }

  if (myTotal === 0 && theirTotal === 0) {
    return {
      status: 'about_even',
      label: 'About even (both zero nominal value)',
      myTotalMinor: 0,
      theirTotalMinor: 0,
      formattedMyTotal: formattedMy,
      formattedTheirTotal: formattedTheir,
      differencePercentage: 0,
    };
  }

  const higher = Math.max(myTotal, theirTotal);
  const diff = Math.abs(myTotal - theirTotal);
  const diffPercent = higher > 0 ? Math.round((diff / higher) * 100) : 0;

  // Threshold: within 15% is considered "about even"
  if (diffPercent <= 15) {
    return {
      status: 'about_even',
      label: `About even (~${diffPercent}% difference)`,
      myTotalMinor: myTotal,
      theirTotalMinor: theirTotal,
      formattedMyTotal: formattedMy,
      formattedTheirTotal: formattedTheir,
      differencePercentage: diffPercent,
    };
  }

  if (myTotal > theirTotal) {
    return {
      status: 'tilted_toward_them',
      label: `Tilted toward them (~${diffPercent}% more value offered by you)`,
      myTotalMinor: myTotal,
      theirTotalMinor: theirTotal,
      formattedMyTotal: formattedMy,
      formattedTheirTotal: formattedTheir,
      differencePercentage: diffPercent,
    };
  }

  return {
    status: 'tilted_toward_you',
    label: `Tilted toward you (~${diffPercent}% more value offered by them)`,
    myTotalMinor: myTotal,
    theirTotalMinor: theirTotal,
    formattedMyTotal: formattedMy,
    formattedTheirTotal: formattedTheir,
    differencePercentage: diffPercent,
  };
}
