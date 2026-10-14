/**
 * Trade Weft — URL Hygiene and Homograph Attack Mitigation
 * Strict normalization, parameter stripping, and canonicalization for verified portfolio links.
 */

// Tracking query parameter prefixes/names to strip
const TRACKING_PARAMS = new Set([
  'ref',
  'source',
  's',
  't',
  'fbclid',
  'igshid',
  'feature',
  'si',
  'gclid',
  'mc_cid',
  'mc_eid',
]);

const TRACKING_PREFIXES = ['utm_'];

/**
 * Checks whether a hostname has potential homograph attack risks
 * (e.g., Punycode encoding spoofing Latin platform domains, or mixed non-ASCII scripts).
 */
export function detectHomographAttack(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // If Punycode is used
  if (lower.includes('xn--')) {
    return true;
  }

  // Check for non-ASCII characters in hostname
  const hasNonAscii = /[^\u0000-\u007F]/.test(lower);
  if (hasNonAscii) {
    return true;
  }

  return false;
}

export interface NormalizeUrlResult {
  valid: boolean;
  normalizedUrl?: string;
  parsedUrl?: URL;
  error?: string;
}

/**
 * Normalizes and sanitizes a user-supplied external portfolio URL.
 * Enforces HTTPS, strips tracking params, lowercases host, and strips credentials.
 */
export function normalizePortfolioUrl(rawInput: string): NormalizeUrlResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return { valid: false, error: 'URL must be a non-empty string' };
  }

  let cleaned = rawInput.trim();
  if (!cleaned) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  // Prepend https:// if protocol is omitted
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return { valid: false, error: 'Malformed URL' };
  }

  const isLocalEnv = process.env.NODE_ENV !== 'production';
  const isLoopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';

  // Strict HTTPS enforcement (HTTP permitted only on loopback in dev/test)
  if (url.protocol !== 'https:') {
    if (!(isLocalEnv && isLoopback && url.protocol === 'http:')) {
      return { valid: false, error: 'Only secure HTTPS links are allowed' };
    }
  }

  // Disallow user credentials embedded in URL
  if (url.username || url.password) {
    return { valid: false, error: 'URLs containing embedded credentials are not allowed' };
  }

  // Detect homograph attacks / suspicious punycode
  if (detectHomographAttack(url.hostname)) {
    return { valid: false, error: 'Internationalized or punycode domain names are not permitted' };
  }

  // Lowercase hostname
  url.hostname = url.hostname.toLowerCase();

  // Remove fragment/hash
  url.hash = '';

  // Filter tracking query parameters
  const searchParams = new URLSearchParams(url.search);
  const keysToDelete: string[] = [];

  searchParams.forEach((_, key) => {
    const lowerKey = key.toLowerCase();
    if (
      TRACKING_PARAMS.has(lowerKey) ||
      TRACKING_PREFIXES.some((p) => lowerKey.startsWith(p))
    ) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => searchParams.delete(key));

  url.search = searchParams.toString();

  // Normalize path: clean consecutive slashes and remove trailing slash (except root)
  let pathname = url.pathname.replace(/\/+/g, '/');
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  url.pathname = pathname;

  return {
    valid: true,
    normalizedUrl: url.toString(),
    parsedUrl: url,
  };
}
