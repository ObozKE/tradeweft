import { describe, it, expect } from 'vitest';
import { sanitizeRedirectUrl } from './security';

describe('sanitizeRedirectUrl', () => {
  it('returns valid relative paths', () => {
    expect(sanitizeRedirectUrl('/dashboard')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('/dashboard/settings')).toBe('/dashboard/settings');
    expect(sanitizeRedirectUrl('/onboarding')).toBe('/onboarding');
    expect(sanitizeRedirectUrl('/onboarding?step=2')).toBe('/onboarding?step=2');
    expect(sanitizeRedirectUrl('/')).toBe('/');
  });

  it('rejects external URLs with protocols', () => {
    expect(sanitizeRedirectUrl('https://evil.com')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('http://evil.com')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('javascript:alert(1)')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('data:text/html,evil')).toBe('/dashboard');
  });

  it('rejects protocol-relative and double slash tricks', () => {
    expect(sanitizeRedirectUrl('//evil.com')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('///evil.com')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('//google.com/test')).toBe('/dashboard');
  });

  it('rejects backslash evasion tricks', () => {
    expect(sanitizeRedirectUrl('\\evil.com')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('/\\evil.com')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('/path\\evil')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('\\\\evil.com')).toBe('/dashboard');
  });

  it('rejects null, undefined, and non-allowlisted routes', () => {
    expect(sanitizeRedirectUrl(null)).toBe('/dashboard');
    expect(sanitizeRedirectUrl(undefined)).toBe('/dashboard');
    expect(sanitizeRedirectUrl('')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('/admin-unauthorized')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('/some-random-route')).toBe('/dashboard');
  });

  it('rejects URLs with whitespace and control characters', () => {
    expect(sanitizeRedirectUrl('/dashboard\n')).toBe('/dashboard');
    expect(sanitizeRedirectUrl(' /dashboard ')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('/dash board')).toBe('/dashboard');
  });
});
