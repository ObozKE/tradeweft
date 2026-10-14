import { describe, it, expect, vi } from 'vitest';
import {
  normalizePortfolioUrl,
  detectHomographAttack,
} from '../utils/url-hygiene';

describe('normalizePortfolioUrl', () => {
  it('normalizes standard HTTPS URLs', () => {
    const res = normalizePortfolioUrl('https://github.com/tradeweft');
    expect(res.valid).toBe(true);
    expect(res.normalizedUrl).toBe('https://github.com/tradeweft');
  });

  it('prepends https:// if missing', () => {
    const res = normalizePortfolioUrl('github.com/developer');
    expect(res.valid).toBe(true);
    expect(res.normalizedUrl).toBe('https://github.com/developer');
  });

  it('lowercases hostname and strips trailing slash', () => {
    const res = normalizePortfolioUrl('https://GITHUB.COM/username/');
    expect(res.valid).toBe(true);
    expect(res.normalizedUrl).toBe('https://github.com/username');
  });

  it('strips tracking parameters and hash fragments', () => {
    const res = normalizePortfolioUrl(
      'https://dribbble.com/shots/1234?utm_source=twitter&utm_medium=social&ref=share#comments'
    );
    expect(res.valid).toBe(true);
    expect(res.normalizedUrl).toBe('https://dribbble.com/shots/1234');
  });

  it('rejects embedded credentials', () => {
    const res = normalizePortfolioUrl('https://user:pass@example.com/portfolio');
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/credentials/i);
  });

  it('detects and rejects homograph punycode attacks', () => {
    const res = normalizePortfolioUrl('https://xn--gthub-1qa.com/fake');
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/punycode/i);
  });

  it('rejects plain HTTP in production environments', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const res = normalizePortfolioUrl('http://example.com');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/https/i);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('detectHomographAttack', () => {
  it('detects xn-- prefix', () => {
    expect(detectHomographAttack('xn--apple-43a.com')).toBe(true);
  });

  it('detects non-ASCII characters', () => {
    expect(detectHomographAttack('gіthub.com')).toBe(true); // Cyrillic 'і'
  });

  it('passes standard ASCII hostnames', () => {
    expect(detectHomographAttack('github.com')).toBe(false);
    expect(detectHomographAttack('my-portfolio.ke')).toBe(false);
  });
});
