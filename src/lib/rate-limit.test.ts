import { describe, it, expect, beforeEach } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('Rate Limiter', () => {
  it('allows requests within the limit', async () => {
    const limiter = createRateLimiter('test:allow', 3, 60);

    const res1 = await limiter.check('user_1');
    expect(res1.success).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = await limiter.check('user_1');
    expect(res2.success).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = await limiter.check('user_1');
    expect(res3.success).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it('blocks requests exceeding the limit', async () => {
    const limiter = createRateLimiter('test:block', 2, 60);

    await limiter.check('user_2');
    await limiter.check('user_2');

    const blockedRes = await limiter.check('user_2');
    expect(blockedRes.success).toBe(false);
    expect(blockedRes.remaining).toBe(0);
  });

  it('tracks different identifiers independently', async () => {
    const limiter = createRateLimiter('test:multi', 1, 60);

    const userARes = await limiter.check('user_A');
    expect(userARes.success).toBe(true);

    const userBRes = await limiter.check('user_B');
    expect(userBRes.success).toBe(true);

    const userABlocked = await limiter.check('user_A');
    expect(userABlocked.success).toBe(false);
  });
});
