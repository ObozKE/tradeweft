/**
 * Security & Sanitization utilities for Trade Weft
 */

const ALLOWED_INTERNAL_PREFIXES = ['/dashboard', '/onboarding', '/'];

/**
 * Validates and sanitizes a redirect URL to prevent Open Redirect attacks.
 * Strictly forbids:
 * - Absolute URLs with protocols (http:, https:, javascript:, data:)
 * - Protocol-relative URLs (//attacker.com)
 * - Backslash bypass tricks (\/attacker.com, \\attacker.com)
 * - Control characters, newlines, and unescaped whitespace
 * - Paths traversing outside the application
 *
 * @param nextUrl - The unvalidated raw redirect query parameter
 * @returns A safe relative path starting with / or fallback to /dashboard
 */
export function sanitizeRedirectUrl(nextUrl: string | null | undefined): string {
  const fallback = '/dashboard';

  if (!nextUrl || typeof nextUrl !== 'string') {
    return fallback;
  }

  const trimmed = nextUrl.trim();

  // Must start with exactly one forward slash, followed by an alphanumeric character, dash, or nothing
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\')) {
    return fallback;
  }

  // Prevent backslash anywhere in the path (which browsers may normalize to forward slash)
  if (trimmed.includes('\\')) {
    return fallback;
  }

  // Prevent protocol indicators or control characters
  if (/[\x00-\x1F\x7F\s]/.test(trimmed) || trimmed.includes(':')) {
    return fallback;
  }

  // Check against internal route allowlist
  const isAllowed = ALLOWED_INTERNAL_PREFIXES.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(`${prefix}/`) || trimmed.startsWith(`${prefix}?`)
  );

  return isAllowed ? trimmed : fallback;
}
