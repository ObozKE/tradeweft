import { safeFetch, type SafeFetchOptions } from './safe-fetch';
import { logger } from '@/lib/logger';

export interface DomainVerificationResult {
  verified: boolean;
  method?: 'meta' | 'well-known';
  error?: string;
}

/**
 * Extracts content from <meta name="tradeweft-verification" content="..."> tag.
 */
export function extractMetaTagCode(html: string): string | null {
  // Pattern 1: name="..." content="..."
  const p1 = /<meta\s+[^>]*name=["']tradeweft-verification["'][^>]*content=["']([^"']+)["']/i;
  const match1 = html.match(p1);
  if (match1 && match1[1]) {
    return match1[1].trim();
  }

  // Pattern 2: content="..." name="..."
  const p2 = /<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']tradeweft-verification["']/i;
  const match2 = html.match(p2);
  if (match2 && match2[1]) {
    return match2[1].trim();
  }

  return null;
}

/**
 * Verifies domain ownership by checking /.well-known/tradeweft-verification.txt
 * or HTML <meta name="tradeweft-verification" content="TW-XXXX-XXXX">.
 */
export async function verifyDomainOwnership(
  domainOrUrl: string,
  challengeCode: string,
  fetchOptions?: SafeFetchOptions
): Promise<DomainVerificationResult> {
  let hostname = domainOrUrl.trim();
  if (hostname.startsWith('http://') || hostname.startsWith('https://')) {
    try {
      hostname = new URL(hostname).hostname;
    } catch {
      return { verified: false, error: 'Malformed domain address.' };
    }
  }

  // 1. Check /.well-known/tradeweft-verification.txt
  const wellKnownUrl = `https://${hostname}/.well-known/tradeweft-verification.txt`;
  try {
    const res = await safeFetch(wellKnownUrl, fetchOptions);
    if (res.status === 200 && res.text.includes(challengeCode)) {
      return { verified: true, method: 'well-known' };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Fetch failed';
    logger.debug({ url: wellKnownUrl, error: msg, event: 'verification.well_known_fetch_failed' });
  }

  // 2. Check HTML <meta> tag on home page
  const homeUrl = `https://${hostname}/`;
  try {
    const res = await safeFetch(homeUrl, fetchOptions);
    if (res.status === 200) {
      const metaCode = extractMetaTagCode(res.text);
      if (metaCode && metaCode.includes(challengeCode)) {
        return { verified: true, method: 'meta' };
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Fetch failed';
    logger.debug({ url: homeUrl, error: msg, event: 'verification.home_meta_fetch_failed' });
  }

  return {
    verified: false,
    error: 'Challenge code not found in /.well-known file or HTML <meta> tag.',
  };
}
