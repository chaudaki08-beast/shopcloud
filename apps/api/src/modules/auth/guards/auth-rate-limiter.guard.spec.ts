import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { prisma } from '@shopcloud/database';
import { AuthRateLimiterGuard, resolveClientIp } from './auth-rate-limiter.guard';

function contextFor(req: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('AuthRateLimiterGuard', () => {
  const originalEnv = { ...process.env };
  // Unique per run so repeated test runs within one window never collide
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const keyFor = (name: string) => `test-${runId}-${name}`;

  beforeEach(() => {
    // Production path: always the shared PostgreSQL counter. (In development the guard follows the cached
    // connectivity probe and may use per-process memory, which would make these assertions nondeterministic.)
    process.env.NODE_ENV = 'production';
    process.env.TEST_RATE_LIMITING = '1';
    process.env.AUTH_RATE_LIMIT_MAX = '3';
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.TRUST_PROXY_HOPS = '0';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(async () => {
    await prisma.authRateLimit.deleteMany({ where: { key: { startsWith: `test-${runId}` } } });
  });

  it('allows up to the limit, then rejects with 429', async () => {
    const guard = new AuthRateLimiterGuard();
    const req = { socket: { remoteAddress: keyFor('limit') }, headers: {} };

    for (let i = 0; i < 3; i++) {
      await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    }
    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('enforces one shared limit across API instances (Cloud Run scale-out)', async () => {
    const instanceA = new AuthRateLimiterGuard();
    const instanceB = new AuthRateLimiterGuard();
    const req = { socket: { remoteAddress: keyFor('shared') }, headers: {} };

    await instanceA.canActivate(contextFor(req));
    await instanceB.canActivate(contextFor(req));
    await instanceA.canActivate(contextFor(req));

    // A fresh in-memory limiter would allow this; the shared counter must not
    await expect(instanceB.canActivate(contextFor(req))).rejects.toBeInstanceOf(HttpException);
  });

  it('keeps separate budgets per client', async () => {
    const guard = new AuthRateLimiterGuard();
    for (let i = 0; i < 3; i++) {
      await guard.canActivate(contextFor({ socket: { remoteAddress: keyFor('client-a') }, headers: {} }));
    }
    await expect(
      guard.canActivate(contextFor({ socket: { remoteAddress: keyFor('client-b') }, headers: {} })),
    ).resolves.toBe(true);
  });

  describe('resolveClientIp', () => {
    it('ignores X-Forwarded-For when no proxy is trusted', () => {
      process.env.TRUST_PROXY_HOPS = '0';
      expect(
        resolveClientIp({ socket: { remoteAddress: '10.0.0.5' }, headers: { 'x-forwarded-for': '1.2.3.4' } }),
      ).toBe('10.0.0.5');
    });

    it('uses the entry appended by the trusted proxy, not client-supplied ones', () => {
      process.env.TRUST_PROXY_HOPS = '1';
      const spoofed = { socket: {}, headers: { 'x-forwarded-for': '6.6.6.6, 198.51.100.7' } };
      expect(resolveClientIp(spoofed)).toBe('198.51.100.7');

      const rotated = { socket: {}, headers: { 'x-forwarded-for': '7.7.7.7, 198.51.100.7' } };
      expect(resolveClientIp(rotated)).toBe(resolveClientIp(spoofed));
    });

    it('falls back to the socket address when the header is shorter than the trusted hop count', () => {
      process.env.TRUST_PROXY_HOPS = '2';
      expect(
        resolveClientIp({ socket: { remoteAddress: '10.0.0.9' }, headers: { 'x-forwarded-for': '1.2.3.4' } }),
      ).toBe('10.0.0.9');
    });
  });
});
