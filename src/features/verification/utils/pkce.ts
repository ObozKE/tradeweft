import crypto from 'node:crypto';

/**
 * Base64URL-encodes a buffer according to RFC 7636.
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generates a high-entropy cryptographic code verifier (43-128 chars).
 */
export function generateCodeVerifier(): string {
  const randomBytes = crypto.randomBytes(32);
  return base64UrlEncode(randomBytes);
}

/**
 * Derives the SHA-256 code challenge from a code verifier.
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Creates a deterministic SHA-256 digest of an OAuth state token
 * for safe database indexing and timing-attack resistant lookup.
 */
export function hashOAuthState(state: string): string {
  return crypto.createHash('sha256').update(state).digest('hex');
}
