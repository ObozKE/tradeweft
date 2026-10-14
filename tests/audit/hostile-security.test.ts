import { describe, it, expect } from 'vitest';
import { isPrivateOrRestrictedIp, safeFetch } from '@/features/verification/utils/safe-fetch';
import { sanitizeRedirectUrl } from '@/lib/security';
import { sniffMagicBytes } from '@/features/media/utils/magic-bytes';
import { validateImageDimensions } from '@/features/media/utils/image-processor';

/**
 * Trade Weft — Hostile Security & Attack Simulation Test Suite
 *
 * Verifies defensive layers against:
 * 1. Server-Side Request Forgery (SSRF) and Cloud Metadata Access
 * 2. Open Redirects and Protocol Injection
 * 3. Hostile Media Uploads (Polyglots, Script Injection, Fake MIME)
 * 4. Path Traversal & URL Tampering
 */

describe('SSRF & IP Restriction Security Verification', () => {
  it('identifies loopback and local broadcast addresses as restricted', () => {
    const loopbacks = [
      '127.0.0.1',
      '127.0.0.2',
      '127.255.255.255',
      '0.0.0.0',
      '::1',
      '::ffff:127.0.0.1',
    ];

    for (const ip of loopbacks) {
      expect(isPrivateOrRestrictedIp(ip), `Expected IP ${ip} to be restricted`).toBe(true);
    }
  });

  it('identifies AWS / Azure / GCP Cloud Metadata IP (169.254.169.254) as restricted', () => {
    const metadataIps = [
      '169.254.169.254',
      '169.254.0.1',
      '169.254.255.255',
      '::ffff:169.254.169.254',
    ];

    for (const ip of metadataIps) {
      expect(isPrivateOrRestrictedIp(ip), `Expected metadata IP ${ip} to be restricted`).toBe(true);
    }
  });

  it('identifies RFC 1918 private subnets as restricted', () => {
    const privateIps = [
      '10.0.0.1',
      '10.255.255.254',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.0.1',
      '192.168.1.100',
    ];

    for (const ip of privateIps) {
      expect(isPrivateOrRestrictedIp(ip), `Expected RFC 1918 IP ${ip} to be restricted`).toBe(true);
    }
  });

  it('permits legitimate public routable IPv4 addresses', () => {
    const publicIps = [
      '8.8.8.8',
      '1.1.1.1',
      '140.82.112.4', // GitHub
      '104.244.42.1', // X / Twitter
    ];

    for (const ip of publicIps) {
      expect(isPrivateOrRestrictedIp(ip), `Expected public IP ${ip} to be allowed`).toBe(false);
    }
  });

  it('safeFetch blocks non-HTTP/HTTPS protocols', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toThrow(/INVALID_PROTOCOL/);
    await expect(safeFetch('ftp://ftp.example.com/file')).rejects.toThrow(/INVALID_PROTOCOL/);
    await expect(safeFetch('gopher://127.0.0.1:70/')).rejects.toThrow(/INVALID_PROTOCOL/);
  });

  it('safeFetch blocks localhost and private IPs via pre-connect DNS verification', async () => {
    await expect(safeFetch('http://127.0.0.1:8080/secret')).rejects.toThrow(/SSRF_BLOCKED/);
    await expect(safeFetch('http://localhost:3000/')).rejects.toThrow(/SSRF_BLOCKED/);
  });
});

describe('Open Redirect & Redirect Sanitization Security Verification', () => {
  it('neutralizes protocol-relative and backslash bypass attempts', () => {
    const hostileRedirects = [
      '//evil.com',
      '///evil.com',
      '\\evil.com',
      '/\\evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      '/dashboard\\evil.com',
      '//attacker.com/dashboard',
    ];

    for (const url of hostileRedirects) {
      const sanitized = sanitizeRedirectUrl(url);
      expect(sanitized, `Failed for ${url}`).toBe('/dashboard');
    }
  });

  it('permits only legitimate internal application routes', () => {
    expect(sanitizeRedirectUrl('/dashboard')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('/dashboard/packages')).toBe('/dashboard/packages');
    expect(sanitizeRedirectUrl('/dashboard/trades/123')).toBe('/dashboard/trades/123');
    expect(sanitizeRedirectUrl('/onboarding')).toBe('/onboarding');
  });

  it('neutralizes path traversal attempts containing dot-dot sequences', () => {
    expect(sanitizeRedirectUrl('/dashboard/../../evil.com')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('/../dashboard')).toBe('/dashboard');
    expect(sanitizeRedirectUrl('/..')).toBe('/dashboard');
  });
});

describe('Hostile Media Upload Attack Simulation', () => {
  it('rejects executable scripts disguised as JPEG images via magic bytes', () => {
    const phpScript = Buffer.from('<?php echo system($_GET["cmd"]); ?>');
    const result = sniffMagicBytes(phpScript);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects SVG and HTML documents disguised as PNG files via magic bytes', () => {
    const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const result = sniffMagicBytes(svgPayload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('strictly prohibited');
  });

  it('rejects zero-byte and truncated buffers', () => {
    const emptyBuffer = Buffer.alloc(0);
    const emptyResult = sniffMagicBytes(emptyBuffer);
    expect(emptyResult.valid).toBe(false);

    const truncated = Buffer.from([0xff, 0xd8, 0xff]); // < 12 bytes
    const truncResult = sniffMagicBytes(truncated);
    expect(truncResult.valid).toBe(false);
  });

  it('rejects corrupted images during Sharp dimension validation', async () => {
    const fakeJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x00]);
    await expect(validateImageDimensions(fakeJpg)).rejects.toThrow();
  });
});
