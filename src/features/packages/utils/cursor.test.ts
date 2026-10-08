import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from './cursor';

describe('Keyset Cursor Codec', () => {
  it('round-trips valid cursor data correctly', () => {
    const original = {
      publishedAt: '2026-10-08T10:00:00.000Z',
      id: 'a0000000-0000-0000-0000-000000000001',
      rank: 0.85,
    };

    const encoded = encodeCursor(original);
    expect(typeof encoded).toBe('string');

    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(original);
  });

  it('rejects tampered or malformed base64 strings gracefully without throwing', () => {
    expect(decodeCursor('invalid-base64-random-string')).toBeNull();
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('rejects valid base64 with missing required cursor schema fields', () => {
    const invalidJson = JSON.stringify({ rank: 1.2 });
    const encoded = Buffer.from(invalidJson).toString('base64url');
    expect(decodeCursor(encoded)).toBeNull();
  });

  it('rejects invalid datetime in cursor', () => {
    const invalidJson = JSON.stringify({
      publishedAt: 'not-a-datetime',
      id: 'a0000000-0000-0000-0000-000000000001',
    });
    const encoded = Buffer.from(invalidJson).toString('base64url');
    expect(decodeCursor(encoded)).toBeNull();
  });
});
