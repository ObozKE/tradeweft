import { z } from 'zod';

export interface KeysetCursor {
  publishedAt?: string;
  rankTs?: string;
  id: string;
  rank?: number;
}

const cursorSchema = z
  .object({
    publishedAt: z.string().datetime().optional(),
    rankTs: z.string().datetime().optional(),
    id: z.string().uuid(),
    rank: z.number().optional(),
  })
  .refine((data) => Boolean(data.publishedAt || data.rankTs), {
    message: 'Must contain publishedAt or rankTs timestamp',
  });

/**
 * Encodes keyset cursor values into an opaque, URL-safe base64 string.
 */
export function encodeCursor(cursor: KeysetCursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, 'utf-8').toString('base64url');
}

/**
 * Decodes and strictly validates an untrusted cursor string.
 * Returns null if the cursor is malformed, invalid, or tampered with.
 */
export function decodeCursor(cursorString: string | null | undefined): KeysetCursor | null {
  if (!cursorString || typeof cursorString !== 'string') {
    return null;
  }

  try {
    const raw = Buffer.from(cursorString, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw);
    const result = cursorSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}
