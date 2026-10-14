import { describe, it, expect } from 'vitest';
import {
  isPrivateOrRestrictedIp,
  safeFetch,
} from '../utils/safe-fetch';
import { extractMetaTagCode } from '../utils/domain-verifier';

describe('isPrivateOrRestrictedIp', () => {
  it('blocks loopback addresses', () => {
    expect(isPrivateOrRestrictedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrRestrictedIp('127.0.1.5')).toBe(true);
    expect(isPrivateOrRestrictedIp('::1')).toBe(true);
  });

  it('blocks RFC 1918 private subnets', () => {
    expect(isPrivateOrRestrictedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrRestrictedIp('10.254.254.254')).toBe(true);
    expect(isPrivateOrRestrictedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrRestrictedIp('172.31.255.255')).toBe(true);
    expect(isPrivateOrRestrictedIp('192.168.0.1')).toBe(true);
    expect(isPrivateOrRestrictedIp('192.168.100.50')).toBe(true);
  });

  it('blocks cloud metadata and link-local addresses', () => {
    expect(isPrivateOrRestrictedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrRestrictedIp('169.254.1.1')).toBe(true);
    expect(isPrivateOrRestrictedIp('fe80::1')).toBe(true);
  });

  it('blocks CGNAT range (100.64.0.0/10)', () => {
    expect(isPrivateOrRestrictedIp('100.64.0.1')).toBe(true);
    expect(isPrivateOrRestrictedIp('100.127.255.254')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 addresses for restricted targets', () => {
    expect(isPrivateOrRestrictedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrRestrictedIp('::ffff:169.254.169.254')).toBe(true);
    expect(isPrivateOrRestrictedIp('::ffff:10.0.0.5')).toBe(true);
  });

  it('blocks IPv6 Unique Local Addresses (fc00::/7)', () => {
    expect(isPrivateOrRestrictedIp('fc00::1')).toBe(true);
    expect(isPrivateOrRestrictedIp('fd00::abcd')).toBe(true);
  });

  it('allows public Internet IP addresses', () => {
    expect(isPrivateOrRestrictedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrRestrictedIp('1.1.1.1')).toBe(false);
    expect(isPrivateOrRestrictedIp('93.184.216.34')).toBe(false);
    expect(isPrivateOrRestrictedIp('172.32.0.1')).toBe(false); // Outside 172.16.0.0/12
    expect(isPrivateOrRestrictedIp('100.63.255.255')).toBe(false); // Outside CGNAT
    expect(isPrivateOrRestrictedIp('100.128.0.1')).toBe(false); // Outside CGNAT
  });
});

describe('safeFetch SSRF Guard', () => {
  it('blocks requests to localhost', async () => {
    await expect(safeFetch('http://localhost:3000/')).rejects.toThrow(/SSRF_BLOCKED/i);
  });

  it('blocks requests to 127.0.0.1', async () => {
    await expect(safeFetch('http://127.0.0.1:8080/')).rejects.toThrow(/SSRF_BLOCKED/i);
  });

  it('blocks requests with forbidden protocols', async () => {
    await expect(safeFetch('ftp://example.com/file.txt')).rejects.toThrow(/INVALID_PROTOCOL/i);
  });
});

describe('extractMetaTagCode', () => {
  it('extracts code when name comes before content', () => {
    const html = '<html><head><meta name="tradeweft-verification" content="TW-ABCD-1234"></head></html>';
    expect(extractMetaTagCode(html)).toBe('TW-ABCD-1234');
  });

  it('extracts code when content comes before name', () => {
    const html = '<html><head><meta content="TW-WXYZ-9876" name="tradeweft-verification"></head></html>';
    expect(extractMetaTagCode(html)).toBe('TW-WXYZ-9876');
  });

  it('returns null when verification tag is missing', () => {
    const html = '<html><head><title>My Portfolio</title></head></html>';
    expect(extractMetaTagCode(html)).toBeNull();
  });
});
