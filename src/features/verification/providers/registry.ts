import type { PlatformConfig, PlatformKey } from '../types/verification.types';

/**
 * Generates an 8-character alphanumeric challenge code formatted as TW-XXXX-XXXX
 * used for manual bio/post verification and domain verification.
 */
export function generateChallengeCode(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 4; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `TW-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

const RESERVED_GITHUB_PATHS = new Set([
  'settings',
  'marketplace',
  'orgs',
  'explore',
  'topics',
  'collections',
  'trending',
  'events',
  'sponsors',
  'login',
  'join',
]);

export const PLATFORM_REGISTRY: Record<PlatformKey, PlatformConfig> = {
  github: {
    key: 'github',
    label: 'GitHub',
    method: 'oauth',
    placeholder: 'https://github.com/username',
    allowedHosts: ['github.com', 'www.github.com'],
    extractHandle: (url: URL) => {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 1 && !RESERVED_GITHUB_PATHS.has(parts[0].toLowerCase())) {
        return parts[0];
      }
      return null;
    },
    normalizeUrl: (url: URL) => {
      const handle = PLATFORM_REGISTRY.github.extractHandle(url);
      return handle ? `https://github.com/${handle}` : `https://github.com${url.pathname}`;
    },
    instructionKey: 'verification.instructions.github',
  },

  figma: {
    key: 'figma',
    label: 'Figma',
    method: 'manual',
    placeholder: 'https://www.figma.com/@handle',
    allowedHosts: ['figma.com', 'www.figma.com'],
    extractHandle: (url: URL) => {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 1) {
        const handle = parts[0].replace(/^@/, '');
        return handle || null;
      }
      return null;
    },
    normalizeUrl: (url: URL) => {
      const handle = PLATFORM_REGISTRY.figma.extractHandle(url);
      return handle ? `https://www.figma.com/@${handle}` : `https://www.figma.com${url.pathname}`;
    },
    instructionKey: 'verification.instructions.figma',
  },

  behance: {
    key: 'behance',
    label: 'Behance',
    method: 'manual',
    placeholder: 'https://www.behance.net/username',
    allowedHosts: ['behance.net', 'www.behance.net'],
    extractHandle: (url: URL) => {
      const parts = url.pathname.split('/').filter(Boolean);
      return parts.length >= 1 ? parts[0] : null;
    },
    normalizeUrl: (url: URL) => {
      const handle = PLATFORM_REGISTRY.behance.extractHandle(url);
      return handle ? `https://www.behance.net/${handle}` : `https://www.behance.net${url.pathname}`;
    },
    instructionKey: 'verification.instructions.behance',
  },

  dribbble: {
    key: 'dribbble',
    label: 'Dribbble',
    method: 'manual',
    placeholder: 'https://dribbble.com/username',
    allowedHosts: ['dribbble.com', 'www.dribbble.com'],
    extractHandle: (url: URL) => {
      const parts = url.pathname.split('/').filter(Boolean);
      return parts.length >= 1 ? parts[0] : null;
    },
    normalizeUrl: (url: URL) => {
      const handle = PLATFORM_REGISTRY.dribbble.extractHandle(url);
      return handle ? `https://dribbble.com/${handle}` : `https://dribbble.com${url.pathname}`;
    },
    instructionKey: 'verification.instructions.dribbble',
  },

  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn',
    method: 'manual',
    placeholder: 'https://www.linkedin.com/in/username',
    allowedHosts: ['linkedin.com', 'www.linkedin.com'],
    extractHandle: (url: URL) => {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'in' && parts[1]) {
        return parts[1];
      }
      if (parts[0] === 'company' && parts[1]) {
        return parts[1];
      }
      return parts.length >= 1 ? parts[0] : null;
    },
    normalizeUrl: (url: URL) => {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'in' && parts[1]) {
        return `https://www.linkedin.com/in/${parts[1]}`;
      }
      if (parts[0] === 'company' && parts[1]) {
        return `https://www.linkedin.com/company/${parts[1]}`;
      }
      return `https://www.linkedin.com${url.pathname}`;
    },
    instructionKey: 'verification.instructions.linkedin',
  },

  instagram: {
    key: 'instagram',
    label: 'Instagram',
    method: 'manual',
    placeholder: 'https://www.instagram.com/username',
    allowedHosts: ['instagram.com', 'www.instagram.com'],
    extractHandle: (url: URL) => {
      const parts = url.pathname.split('/').filter(Boolean);
      return parts.length >= 1 ? parts[0].replace(/^@/, '') : null;
    },
    normalizeUrl: (url: URL) => {
      const handle = PLATFORM_REGISTRY.instagram.extractHandle(url);
      return handle ? `https://www.instagram.com/${handle}` : `https://www.instagram.com${url.pathname}`;
    },
    instructionKey: 'verification.instructions.instagram',
  },

  facebook: {
    key: 'facebook',
    label: 'Facebook',
    method: 'manual',
    placeholder: 'https://www.facebook.com/page-or-profile',
    allowedHosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com'],
    extractHandle: (url: URL) => {
      const parts = url.pathname.split('/').filter(Boolean);
      return parts.length >= 1 ? parts[0] : null;
    },
    normalizeUrl: (url: URL) => {
      const handle = PLATFORM_REGISTRY.facebook.extractHandle(url);
      return handle ? `https://www.facebook.com/${handle}` : `https://www.facebook.com${url.pathname}`;
    },
    instructionKey: 'verification.instructions.facebook',
  },

  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    method: 'manual',
    placeholder: 'https://www.tiktok.com/@username',
    allowedHosts: ['tiktok.com', 'www.tiktok.com'],
    extractHandle: (url: URL) => {
      const parts = url.pathname.split('/').filter(Boolean);
      return parts.length >= 1 ? parts[0].replace(/^@/, '') : null;
    },
    normalizeUrl: (url: URL) => {
      const handle = PLATFORM_REGISTRY.tiktok.extractHandle(url);
      return handle ? `https://www.tiktok.com/@${handle}` : `https://www.tiktok.com${url.pathname}`;
    },
    instructionKey: 'verification.instructions.tiktok',
  },

  youtube: {
    key: 'youtube',
    label: 'YouTube',
    method: 'manual',
    placeholder: 'https://www.youtube.com/@channel',
    allowedHosts: ['youtube.com', 'www.youtube.com'],
    extractHandle: (url: URL) => {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 1) {
        if (parts[0].startsWith('@')) {
          return parts[0].slice(1);
        }
        if ((parts[0] === 'c' || parts[0] === 'channel') && parts[1]) {
          return parts[1];
        }
        return parts[0];
      }
      return null;
    },
    normalizeUrl: (url: URL) => {
      const handle = PLATFORM_REGISTRY.youtube.extractHandle(url);
      return handle ? `https://www.youtube.com/@${handle}` : `https://www.youtube.com${url.pathname}`;
    },
    instructionKey: 'verification.instructions.youtube',
  },

  x: {
    key: 'x',
    label: 'X (formerly Twitter)',
    method: 'manual',
    placeholder: 'https://x.com/username',
    allowedHosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
    extractHandle: (url: URL) => {
      const parts = url.pathname.split('/').filter(Boolean);
      return parts.length >= 1 ? parts[0].replace(/^@/, '') : null;
    },
    normalizeUrl: (url: URL) => {
      const handle = PLATFORM_REGISTRY.x.extractHandle(url);
      return handle ? `https://x.com/${handle}` : `https://x.com${url.pathname}`;
    },
    instructionKey: 'verification.instructions.x',
  },

  google_business: {
    key: 'google_business',
    label: 'Google Business Profile',
    method: 'manual',
    placeholder: 'https://maps.google.com/?cid=...',
    allowedHosts: ['google.com', 'www.google.com', 'maps.google.com', 'business.google.com', 'g.page'],
    extractHandle: (url: URL) => {
      if (url.hostname === 'g.page') {
        const parts = url.pathname.split('/').filter(Boolean);
        return parts[0] || null;
      }
      return url.searchParams.get('cid') || url.pathname.split('/').filter(Boolean)[0] || null;
    },
    normalizeUrl: (url: URL) => {
      return url.toString();
    },
    instructionKey: 'verification.instructions.google_business',
  },

  personal_website: {
    key: 'personal_website',
    label: 'Personal Website',
    method: 'domain',
    placeholder: 'https://example.com',
    allowedHosts: [], // Any valid non-platform domain
    extractHandle: (url: URL) => {
      return url.hostname;
    },
    normalizeUrl: (url: URL) => {
      return `${url.protocol}//${url.hostname}`;
    },
    instructionKey: 'verification.instructions.personal_website',
  },
};

export function getPlatformConfig(key: string): PlatformConfig | null {
  return PLATFORM_REGISTRY[key as PlatformKey] || null;
}

export function getAllPlatforms(): PlatformConfig[] {
  return Object.values(PLATFORM_REGISTRY);
}

/**
 * Validates whether a normalized URL matches the given platform config.
 */
export function validateUrlForPlatform(
  platform: PlatformConfig,
  url: URL
): { valid: boolean; error?: string } {
  if (platform.key === 'personal_website') {
    // Cannot be one of the known platform hostnames
    const isPlatformHost = Object.values(PLATFORM_REGISTRY).some(
      (p) => p.key !== 'personal_website' && p.allowedHosts.includes(url.hostname)
    );
    if (isPlatformHost) {
      return {
        valid: false,
        error: 'Please select the specific social or developer platform for this link instead of Personal Website.',
      };
    }
    return { valid: true };
  }

  const matchesHost = platform.allowedHosts.includes(url.hostname);
  if (!matchesHost) {
    return {
      valid: false,
      error: `URL must be on ${platform.label} (${platform.allowedHosts[0]})`,
    };
  }

  const handle = platform.extractHandle(url);
  if (!handle) {
    return {
      valid: false,
      error: `Could not identify a valid profile handle or identifier in this URL.`,
    };
  }

  return { valid: true };
}
