import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns/promises';

/**
 * Checks if an IPv4 or IPv6 address belongs to private, loopback, link-local,
 * cloud metadata, CGNAT, multicast, or reserved ranges.
 */
export function isPrivateOrRestrictedIp(ip: string): boolean {
  if (!ip) return true;

  // Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1 or ::ffff:7f00:1)
  const ipv4MappedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4MappedMatch) {
    return isPrivateOrRestrictedIp(ipv4MappedMatch[1]);
  }

  const isV4 = net.isIPv4(ip);
  const isV6 = net.isIPv6(ip);

  if (!isV4 && !isV6) {
    return true; // Malformed address
  }

  if (isV4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    const [a, b] = parts;

    // 0.0.0.0/8 (Broadcast/Current network)
    if (a === 0) return true;

    // 10.0.0.0/8 (RFC 1918 Private)
    if (a === 10) return true;

    // 100.64.0.0/10 (Carrier-grade NAT RFC 6598)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;

    // 169.254.0.0/16 (Link-local & Cloud Metadata)
    if (a === 169 && b === 254) return true;

    // 172.16.0.0/12 (RFC 1918 Private)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && parts[2] === 0) return true;

    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && parts[2] === 2) return true;

    // 192.168.0.0/16 (RFC 1918 Private)
    if (a === 192 && b === 168) return true;

    // 198.18.0.0/15 (Network benchmark tests)
    if (a === 198 && (b === 18 || b === 19)) return true;

    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && parts[2] === 100) return true;

    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && parts[2] === 113) return true;

    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;

    // 240.0.0.0/4 (Reserved / Future use)
    if (a >= 240) return true;

    return false;
  }

  // IPv6 Checks
  const normalized = ip.toLowerCase();

  // :: or ::1 (Unspecified / Loopback)
  if (normalized === '::' || normalized === '::1') return true;

  // fe80::/10 (Link-local)
  if (/^fe[89ab][0-9a-f]/i.test(normalized)) return true;

  // fc00::/7 (Unique Local Address RFC 4193)
  if (/^f[cd][0-9a-f]{2}/i.test(normalized)) return true;

  // ff00::/8 (Multicast)
  if (normalized.startsWith('ff')) return true;

  return false;
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  allowTestLoopback?: boolean;
}

export interface SafeFetchResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
}

/**
 * Hardened SSRF-safe HTTP client with DNS pre-validation, connect-time socket validation,
 * redirect limits, and response byte caps.
 */
export async function safeFetch(
  targetUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResponse> {
  const maxRedirects = options.maxRedirects ?? 3;
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxBytes = options.maxBytes ?? 102400; // 100 KB max
  const allowTestLoopback = Boolean(options.allowTestLoopback);

  return new Promise<SafeFetchResponse>((resolve, reject) => {
    let currentUrlStr = targetUrl;
    let redirectCount = 0;

    const executeRequest = async (urlStr: string) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlStr);
      } catch {
        return reject(new Error('INVALID_URL: Failed to parse URL'));
      }

      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return reject(new Error('INVALID_PROTOCOL: Only HTTP and HTTPS are permitted'));
      }

      // 1. Pre-resolve DNS and validate all returned IP addresses
      const hostname = parsedUrl.hostname;
      if (
        !allowTestLoopback &&
        (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]')
      ) {
        return reject(new Error('SSRF_BLOCKED: Connection to localhost is prohibited'));
      }

      try {
        const addresses = await dns.lookup(hostname, { all: true });
        for (const addr of addresses) {
          if (!allowTestLoopback && isPrivateOrRestrictedIp(addr.address)) {
            return reject(
              new Error(`SSRF_BLOCKED: Host resolves to restricted IP ${addr.address}`)
            );
          }
        }
      } catch (dnsErr: unknown) {
        const msg = dnsErr instanceof Error ? dnsErr.message : 'DNS lookup failed';
        return reject(new Error(`DNS_RESOLUTION_FAILED: ${msg}`));
      }

      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      // 2. Custom Agent enforcing connect-time socket address verification
      const agentOptions = {
        keepAlive: false,
        timeout: timeoutMs,
      };

      const req = transport.request(
        parsedUrl,
        {
          method: 'GET',
          agent: isHttps ? new https.Agent(agentOptions) : new http.Agent(agentOptions),
          headers: {
            'User-Agent': 'TradeWeft-Verification/1.0 (+https://tradeweft.com/trust)',
            Accept: 'text/html, text/plain;q=0.9, */*;q=0.5',
            Connection: 'close',
          },
          timeout: timeoutMs,
        },
        (res) => {
          const status = res.statusCode || 0;

          // Socket connect-time check
          const socketAddress = res.socket?.remoteAddress;
          if (socketAddress && !allowTestLoopback && isPrivateOrRestrictedIp(socketAddress)) {
            res.destroy();
            return reject(
              new Error(`SSRF_BLOCKED: Connect-time socket is restricted IP ${socketAddress}`)
            );
          }

          // Handle redirects
          if (status >= 300 && status < 400 && res.headers.location) {
            redirectCount++;
            if (redirectCount > maxRedirects) {
              res.destroy();
              return reject(new Error('MAX_REDIRECTS_EXCEEDED: Exceeded redirect limit'));
            }

            const nextLocation = new URL(res.headers.location, urlStr).toString();
            res.resume(); // drain response
            return executeRequest(nextLocation);
          }

          // Check Content-Length if present
          const contentLength = res.headers['content-length'];
          if (contentLength && parseInt(contentLength, 10) > maxBytes) {
            res.destroy();
            return reject(new Error('RESPONSE_TOO_LARGE: Content exceeds 100 KB limit'));
          }

          let receivedBytes = 0;
          const chunks: Buffer[] = [];

          res.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length;
            if (receivedBytes > maxBytes) {
              res.destroy();
              return reject(new Error('RESPONSE_TOO_LARGE: Response body exceeded 100 KB'));
            }
            chunks.push(chunk);
          });

          res.on('end', () => {
            const rawBody = Buffer.concat(chunks).toString('utf-8');
            const flatHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (v) flatHeaders[k] = Array.isArray(v) ? v.join(', ') : v;
            }
            resolve({
              status,
              headers: flatHeaders,
              text: rawBody,
            });
          });

          res.on('error', (err) => {
            reject(err);
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('REQUEST_TIMEOUT: safeFetch timed out'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    };

    executeRequest(currentUrlStr);
  });
}
