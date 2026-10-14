import { describe, it, expect } from 'vitest';
import {
  PLATFORM_REGISTRY,
  getPlatformConfig,
  getAllPlatforms,
  validateUrlForPlatform,
  generateChallengeCode,
} from '../providers/registry';

describe('Platform Registry', () => {
  it('contains all 12 supported platforms', () => {
    const platforms = getAllPlatforms();
    expect(platforms).toHaveLength(12);
    expect(getPlatformConfig('github')).toBeDefined();
    expect(getPlatformConfig('figma')).toBeDefined();
    expect(getPlatformConfig('behance')).toBeDefined();
    expect(getPlatformConfig('dribbble')).toBeDefined();
    expect(getPlatformConfig('linkedin')).toBeDefined();
    expect(getPlatformConfig('instagram')).toBeDefined();
    expect(getPlatformConfig('facebook')).toBeDefined();
    expect(getPlatformConfig('tiktok')).toBeDefined();
    expect(getPlatformConfig('youtube')).toBeDefined();
    expect(getPlatformConfig('x')).toBeDefined();
    expect(getPlatformConfig('google_business')).toBeDefined();
    expect(getPlatformConfig('personal_website')).toBeDefined();
  });

  it('generates well-formatted challenge codes', () => {
    const code = generateChallengeCode();
    expect(code).toMatch(/^TW-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('correctly validates GitHub URLs and extracts handles', () => {
    const github = PLATFORM_REGISTRY.github;
    const url = new URL('https://github.com/torvalds');
    const result = validateUrlForPlatform(github, url);
    expect(result.valid).toBe(true);
    expect(github.extractHandle(url)).toBe('torvalds');
  });

  it('rejects GitHub reserved paths as handles', () => {
    const github = PLATFORM_REGISTRY.github;
    const url = new URL('https://github.com/settings');
    const result = validateUrlForPlatform(github, url);
    expect(result.valid).toBe(false);
  });

  it('validates LinkedIn profiles and company URLs', () => {
    const linkedin = PLATFORM_REGISTRY.linkedin;
    const userUrl = new URL('https://www.linkedin.com/in/jane-doe');
    expect(validateUrlForPlatform(linkedin, userUrl).valid).toBe(true);
    expect(linkedin.extractHandle(userUrl)).toBe('jane-doe');

    const companyUrl = new URL('https://linkedin.com/company/acme-corp');
    expect(validateUrlForPlatform(linkedin, companyUrl).valid).toBe(true);
    expect(linkedin.extractHandle(companyUrl)).toBe('acme-corp');
  });

  it('validates personal websites and disallows known platform hosts', () => {
    const personal = PLATFORM_REGISTRY.personal_website;
    const validUrl = new URL('https://developer.ke');
    expect(validateUrlForPlatform(personal, validUrl).valid).toBe(true);

    const invalidHostUrl = new URL('https://github.com/test');
    const invalidResult = validateUrlForPlatform(personal, invalidHostUrl);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.error).toMatch(/select the specific/i);
  });
});
