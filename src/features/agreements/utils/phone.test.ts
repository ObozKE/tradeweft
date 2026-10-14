import { describe, it, expect } from 'vitest';
import { validateAndFormatPhone } from './phone';

describe('Phone Number Validation & E.164 Normalization', () => {
  it('validates and formats a local Kenyan 07... mobile number', () => {
    const res = validateAndFormatPhone('0712345678', 'KE');
    expect(res.isValid).toBe(true);
    expect(res.e164).toBe('+254712345678');
    expect(res.country).toBe('KE');
  });

  it('validates and formats a local Kenyan 01... mobile number', () => {
    const res = validateAndFormatPhone('0110123456', 'KE');
    expect(res.isValid).toBe(true);
    expect(res.e164).toBe('+254110123456');
    expect(res.country).toBe('KE');
  });

  it('validates already formatted +254 numbers', () => {
    const res = validateAndFormatPhone('+254 712 345 678');
    expect(res.isValid).toBe(true);
    expect(res.e164).toBe('+254712345678');
  });

  it('rejects invalid numbers and garbage strings', () => {
    const res = validateAndFormatPhone('not-a-number', 'KE');
    expect(res.isValid).toBe(false);
    expect(res.e164).toBeNull();
    expect(res.error).toBeDefined();
  });

  it('rejects numbers with too few digits', () => {
    const res = validateAndFormatPhone('07123', 'KE');
    expect(res.isValid).toBe(false);
    expect(res.e164).toBeNull();
  });

  it('handles empty input gracefully', () => {
    const res = validateAndFormatPhone('');
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Phone number is required');
  });
});
