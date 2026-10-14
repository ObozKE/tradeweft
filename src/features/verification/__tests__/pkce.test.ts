import { describe, it, expect } from 'vitest';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  hashOAuthState,
} from '../utils/pkce';

describe('PKCE Utilities', () => {
  it('generates high entropy code verifiers', () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();
    expect(v1).toHaveLength(43);
    expect(v2).toHaveLength(43);
    expect(v1).not.toBe(v2);
    expect(v1).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('computes deterministic code challenge for verifier', () => {
    const verifier = 'test-verifier-constant-value-1234567890';
    const c1 = generateCodeChallenge(verifier);
    const c2 = generateCodeChallenge(verifier);
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('computes deterministic sha256 hash of state', () => {
    const state = '01234567-89ab-cdef-0123-456789abcdef';
    const h1 = hashOAuthState(state);
    const h2 = hashOAuthState(state);
    expect(h1).toHaveLength(64);
    expect(h1).toBe(h2);
  });
});
