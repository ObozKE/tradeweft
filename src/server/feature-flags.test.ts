import { describe, it, expect } from 'vitest';
import { getCountryFeatureFlags, isFeatureEnabledForCountry } from './feature-flags';

describe('Feature Flags Engine', () => {
  it('enables Kenya launch features', () => {
    const keFlags = getCountryFeatureFlags('KE');
    expect(keFlags.barterListings).toBe(true);
    expect(keFlags.mobileMoneyEscrow).toBe(true);
    expect(keFlags.trustLedger).toBe(true);
  });

  it('keeps unlaunched countries disabled by default', () => {
    const ugFlags = getCountryFeatureFlags('UG');
    expect(ugFlags.barterListings).toBe(false);
    expect(ugFlags.mobileMoneyEscrow).toBe(false);
  });

  it('handles lowercase or unknown country codes gracefully', () => {
    expect(isFeatureEnabledForCountry('mobileMoneyEscrow', 'ke')).toBe(true);
    expect(isFeatureEnabledForCountry('mobileMoneyEscrow', 'XX')).toBe(false);
  });
});
