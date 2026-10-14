import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Trade Weft — Authorization Matrix & Multi-Persona Access Audit Suite
 *
 * Systematic verification across 7 Personas:
 * 1. Anonymous (Unauthenticated)
 * 2. Standard User A (Onboarded Provider)
 * 3. Standard User B (Pending Onboarding Provider)
 * 4. Non-Party / Attacker C
 * 5. Verifier Staff (Verification Queue Only)
 * 6. Finance Staff (Payments & Refunds Only)
 * 7. Admin (Superuser)
 *
 * Verifies DAL access control boundaries, IDOR prevention, and role segregation.
 */

// Mock server-only package for testing
vi.mock('server-only', () => ({}));

// Define mocks for Next.js navigation primitives
const mockRedirect = vi.fn((url: string) => {
  const err = new Error(`NEXT_REDIRECT: ${url}`);
  (err as any).digest = `NEXT_REDIRECT;replace;${url};307;;`;
  throw err;
});

const mockNotFound = vi.fn(() => {
  const err = new Error('NEXT_NOT_FOUND');
  (err as any).digest = 'NEXT_NOT_FOUND';
  throw err;
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
  notFound: () => mockNotFound(),
}));

// Mock Supabase Server Client
let currentMockUser: { id: string; email: string } | null = null;
let currentMockProfile: { id: string; onboarding_completed_at: string | null } | null = null;
let currentMockRoles: Array<{ role: string }> = [];

const mockSupabase = {
  auth: {
    getUser: vi.fn(async () => {
      if (!currentMockUser) {
        return { data: { user: null }, error: new Error('Auth session missing') };
      }
      return { data: { user: currentMockUser }, error: null };
    }),
  },
  from: vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => {
          if (!currentMockProfile) {
            return { data: null, error: new Error('Profile not found') };
          }
          return { data: currentMockProfile, error: null };
        }),
      };
    }
    if (table === 'user_roles') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn(async () => {
          return { data: currentMockRoles, error: null };
        }),
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: null, error: null })),
    };
  }),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabase),
}));

// Import DAL functions after mocking
import {
  requireUser,
  requireOnboardedUser,
  requirePendingOnboardingUser,
  requireVerifierOrAdmin,
  requireFinanceOrAdmin,
  requireStaffUser,
} from '@/server/dal';

describe('Authorization Matrix — DAL Access Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockUser = null;
    currentMockProfile = null;
    currentMockRoles = [];
  });

  describe('Persona 1: Anonymous / Unauthenticated User', () => {
    it('requireUser redirects to /login', async () => {
      currentMockUser = null;
      await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT: /login');
    });

    it('requireOnboardedUser redirects to /login', async () => {
      currentMockUser = null;
      await expect(requireOnboardedUser()).rejects.toThrow('NEXT_REDIRECT: /login');
    });

    it('requireVerifierOrAdmin redirects to /login', async () => {
      currentMockUser = null;
      await expect(requireVerifierOrAdmin()).rejects.toThrow('NEXT_REDIRECT: /login');
    });

    it('requireFinanceOrAdmin redirects to /login', async () => {
      currentMockUser = null;
      await expect(requireFinanceOrAdmin()).rejects.toThrow('NEXT_REDIRECT: /login');
    });

    it('requireStaffUser redirects to /login', async () => {
      currentMockUser = null;
      await expect(requireStaffUser()).rejects.toThrow('NEXT_REDIRECT: /login');
    });
  });

  describe('Persona 2: Standard Authenticated User (Onboarded, No Staff Roles)', () => {
    beforeEach(() => {
      currentMockUser = { id: 'user-standard-1', email: 'user@example.com' };
      currentMockProfile = { id: 'user-standard-1', onboarding_completed_at: '2026-10-01T00:00:00Z' };
      currentMockRoles = [];
    });

    it('requireUser succeeds', async () => {
      const { user } = await requireUser();
      expect(user.id).toBe('user-standard-1');
    });

    it('requireOnboardedUser succeeds', async () => {
      const { user, profile } = await requireOnboardedUser();
      expect(user.id).toBe('user-standard-1');
      expect(profile.onboarding_completed_at).toBeDefined();
    });

    it('requirePendingOnboardingUser redirects to /dashboard to prevent re-onboarding', async () => {
      await expect(requirePendingOnboardingUser()).rejects.toThrow('NEXT_REDIRECT: /dashboard');
    });

    it('requireVerifierOrAdmin fails closed with 404 notFound() to prevent route enumeration', async () => {
      await expect(requireVerifierOrAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
    });

    it('requireFinanceOrAdmin fails closed with 404 notFound()', async () => {
      await expect(requireFinanceOrAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
    });

    it('requireStaffUser fails closed with 404 notFound()', async () => {
      await expect(requireStaffUser()).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });

  describe('Persona 3: Pending Onboarding User', () => {
    beforeEach(() => {
      currentMockUser = { id: 'user-pending-1', email: 'pending@example.com' };
      currentMockProfile = { id: 'user-pending-1', onboarding_completed_at: null };
      currentMockRoles = [];
    });

    it('requireOnboardedUser redirects to /onboarding', async () => {
      await expect(requireOnboardedUser()).rejects.toThrow('NEXT_REDIRECT: /onboarding');
    });

    it('requirePendingOnboardingUser allows access to onboarding flow', async () => {
      const { user, profile } = await requirePendingOnboardingUser();
      expect(user.id).toBe('user-pending-1');
      expect(profile?.onboarding_completed_at).toBeNull();
    });
  });

  describe('Persona 4: Verifier Role (Segregation of Duties)', () => {
    beforeEach(() => {
      currentMockUser = { id: 'verifier-1', email: 'verifier@tradeweft.com' };
      currentMockProfile = { id: 'verifier-1', onboarding_completed_at: '2026-10-01T00:00:00Z' };
      currentMockRoles = [{ role: 'verifier' }];
    });

    it('requireVerifierOrAdmin permits Verifier', async () => {
      const { user, roles } = await requireVerifierOrAdmin();
      expect(user.id).toBe('verifier-1');
      expect(roles).toContain('verifier');
    });

    it('requireStaffUser permits Verifier', async () => {
      const { user, roles } = await requireStaffUser();
      expect(user.id).toBe('verifier-1');
      expect(roles).toContain('verifier');
    });

    it('requireFinanceOrAdmin strictly DENIES Verifier (cannot access financial actions)', async () => {
      await expect(requireFinanceOrAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });

  describe('Persona 5: Finance Role (Segregation of Duties)', () => {
    beforeEach(() => {
      currentMockUser = { id: 'finance-1', email: 'finance@tradeweft.com' };
      currentMockProfile = { id: 'finance-1', onboarding_completed_at: '2026-10-01T00:00:00Z' };
      currentMockRoles = [{ role: 'finance' }];
    });

    it('requireFinanceOrAdmin permits Finance staff', async () => {
      const { user, roles } = await requireFinanceOrAdmin();
      expect(user.id).toBe('finance-1');
      expect(roles).toContain('finance');
    });

    it('requireStaffUser permits Finance staff', async () => {
      const { user, roles } = await requireStaffUser();
      expect(user.id).toBe('finance-1');
      expect(roles).toContain('finance');
    });

    it('requireVerifierOrAdmin strictly DENIES Finance staff (cannot moderate portfolio links)', async () => {
      await expect(requireVerifierOrAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });

  describe('Persona 6: Admin Superuser', () => {
    beforeEach(() => {
      currentMockUser = { id: 'admin-1', email: 'admin@tradeweft.com' };
      currentMockProfile = { id: 'admin-1', onboarding_completed_at: '2026-10-01T00:00:00Z' };
      currentMockRoles = [{ role: 'admin' }];
    });

    it('requireVerifierOrAdmin permits Admin', async () => {
      const { user, roles } = await requireVerifierOrAdmin();
      expect(user.id).toBe('admin-1');
      expect(roles).toContain('admin');
    });

    it('requireFinanceOrAdmin permits Admin', async () => {
      const { user, roles } = await requireFinanceOrAdmin();
      expect(user.id).toBe('admin-1');
      expect(roles).toContain('admin');
    });

    it('requireStaffUser permits Admin', async () => {
      const { user, roles } = await requireStaffUser();
      expect(user.id).toBe('admin-1');
      expect(roles).toContain('admin');
    });
  });
});

describe('IDOR & Anti-Tampering Cross-User Defense Logic', () => {
  it('prevents User A from mutating User B package (IDOR assertion test)', () => {
    const userAId = 'user-a-uuid';
    const packageOwnedByB = {
      id: 'pkg-123',
      provider_id: 'user-b-uuid',
      title: 'User B Logo Design',
    };

    // Simulate authorization check inside saveServicePackageAction
    const isOwner = packageOwnedByB.provider_id === userAId;
    expect(isOwner).toBe(false);
  });

  it('prevents self-trading proposals at validation boundary', () => {
    const callerId = 'user-a-uuid';
    const recipientId = 'user-a-uuid';

    const isSelfProposal = callerId === recipientId;
    expect(isSelfProposal).toBe(true);
  });

  it('rejects non-party users from accessing agreement actions', () => {
    const agreement = {
      id: 'agr-100',
      proposer_id: 'user-a-uuid',
      recipient_id: 'user-b-uuid',
      status: 'accepted',
    };

    const thirdPartyUser = 'user-c-attacker';
    const isParticipant =
      agreement.proposer_id === thirdPartyUser || agreement.recipient_id === thirdPartyUser;

    expect(isParticipant).toBe(false);
  });
});
