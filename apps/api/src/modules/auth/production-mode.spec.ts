import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prisma } from '@shopcloud/database';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PermissionsService } from './permissions.service';

/**
 * Demo identities and offline fallbacks must never authenticate anyone when NODE_ENV=production
 * (Cloud Run). Outside production they remain available for local preview and DB-less tests.
 */
describe('Auth in production mode', () => {
  const originalEnv = { ...process.env };
  const permissionsService = new PermissionsService();

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'production-mode-spec-secret-at-least-32-chars';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('refuses to start without a JWT secret', () => {
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => new JwtStrategy(permissionsService)).toThrow(/JWT_ACCESS_SECRET must be set/);
  });

  it('does not accept demo token subjects without a real user row', async () => {
    // The dev seed creates real rows with these IDs; simulate a production database without them
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null as any);
    const strategy = new JwtStrategy(permissionsService);
    for (const sub of ['usr-admin-demo', 'user-admin', 'usr-customer-demo', 'usr-inventory-demo']) {
      await expect(
        strategy.validate({ sub, email: 'admin@shopcloud.dev', role: 'SUPER_ADMIN' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('does not log in with demo credentials when the user is not in the database', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null as any);
    const authService = new AuthService(
      new JwtService({ secret: process.env.JWT_ACCESS_SECRET }),
      permissionsService,
    );

    await expect(
      authService.login({ email: 'admin@shopcloud.dev', password: 'Password123!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('still allows the demo login outside production (local preview)', async () => {
    process.env.NODE_ENV = 'development';
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null as any);
    const authService = new AuthService(
      new JwtService({ secret: process.env.JWT_ACCESS_SECRET }),
      permissionsService,
    );

    const result = await authService.login({ email: 'admin@shopcloud.dev', password: 'Password123!' });
    expect(result.user.id).toBe('usr-admin-demo');
  });
});
