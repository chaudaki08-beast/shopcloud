import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PermissionsService } from './permissions.service';
import { prisma, Role, AccountStatus } from '@shopcloud/database';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let authService: AuthService;
  let jwtService: JwtService;
  const testEmail = `test.user.${Date.now()}@shopcloud.test`;
  const testPassword = 'SecurePassword123!';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'shopcloud-super-secret-jwt-key-2026-min-32-chars!',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [AuthService, PermissionsService],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);

    // Clean up test email if exists
    try {
      await prisma.refreshToken.deleteMany({
        where: { user: { email: { in: [testEmail, 'disabled.test@shopcloud.test', 'rotation.test@shopcloud.test'] } } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [testEmail, 'disabled.test@shopcloud.test', 'rotation.test@shopcloud.test'] } },
      });
    } catch {}
  });

  afterAll(async () => {
    try {
      await prisma.refreshToken.deleteMany({
        where: { user: { email: { in: [testEmail, 'disabled.test@shopcloud.test', 'rotation.test@shopcloud.test'] } } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [testEmail, 'disabled.test@shopcloud.test', 'rotation.test@shopcloud.test'] } },
      });
    } catch {}
  });

  describe('Registration', () => {
    it('should register a new customer user and normalize email', async () => {
      const result = await authService.register({
        email: `  ${testEmail.toUpperCase()}  `,
        password: testPassword,
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(testEmail.toLowerCase());
      expect(result.user.role).toBe(Role.CUSTOMER);
      // Ensure passwordHash is never returned
      expect((result.user as any).passwordHash).toBeUndefined();
    });

    it('should reject registration with duplicate email (ConflictException)', async () => {
      await expect(
        authService.register({
          email: testEmail,
          password: testPassword,
          firstName: 'Another',
          lastName: 'User',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject registration with weak password (< 8 chars)', async () => {
      await expect(
        authService.register({
          email: 'shortpass@shopcloud.test',
          password: 'short',
          firstName: 'Short',
          lastName: 'Pass',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Login', () => {
    it('should authenticate user with valid credentials', async () => {
      const result = await authService.login({
        email: testEmail,
        password: testPassword,
      });

      expect(result).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe(testEmail);
      expect((result.user as any).passwordHash).toBeUndefined();

      const decoded: any = jwtService.decode(result.accessToken);
      expect(decoded.sub).toBe(result.user.id);
      expect(decoded.email).toBe(testEmail);
      expect(decoded.role).toBe(Role.CUSTOMER);
    });

    it('should throw UnauthorizedException with generic message for incorrect password', async () => {
      await expect(
        authService.login({
          email: testEmail,
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with generic message for unknown email', async () => {
      await expect(
        authService.login({
          email: 'unknown-account@shopcloud.dev',
          password: 'SomePassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject login for disabled account', async () => {
      const disabledEmail = 'disabled.test@shopcloud.test';
      const hash = await bcrypt.hash('Secret123!', 12);
      await prisma.user.create({
        data: {
          email: disabledEmail,
          passwordHash: hash,
          firstName: 'Disabled',
          lastName: 'User',
          role: Role.CUSTOMER,
          status: AccountStatus.DISABLED,
        },
      });

      await expect(
        authService.login({
          email: disabledEmail,
          password: 'Secret123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Refresh Token Rotation & Reuse Detection', () => {
    let currentRefreshToken: string;
    let registeredUser: any;

    beforeAll(async () => {
      const rotEmail = 'rotation.test@shopcloud.test';
      const reg = await authService.register({
        email: rotEmail,
        password: testPassword,
        firstName: 'Rotation',
        lastName: 'Tester',
      });
      registeredUser = reg.user;
      currentRefreshToken = reg.refreshToken;
    });

    it('should rotate refresh token and issue new token pair', async () => {
      const refreshed = await authService.refresh(currentRefreshToken);

      expect(refreshed.accessToken).toBeDefined();
      expect(refreshed.refreshToken).toBeDefined();
      expect(refreshed.refreshToken).not.toBe(currentRefreshToken);

      // Now attempting to use the old rotated token must trigger REUSE DETECTION
      await expect(authService.refresh(currentRefreshToken)).rejects.toThrow(
        UnauthorizedException,
      );

      // Reuse detection should have revoked the newly rotated token too
      await expect(authService.refresh(refreshed.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject malformed refresh token', async () => {
      await expect(authService.refresh('invalid-token-string')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Profile & Logout', () => {
    it('should return sanitized profile for authenticated user', async () => {
      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      const profile = await authService.getProfile(user!.id);

      expect(profile).toBeDefined();
      expect(profile.id).toBe(user!.id);
      expect(profile.email).toBe(testEmail);
      expect((profile as any).passwordHash).toBeUndefined();
    });

    it('should revoke refresh tokens on logout', async () => {
      const loginRes = await authService.login({
        email: testEmail,
        password: testPassword,
      });

      const logoutRes = await authService.logout(loginRes.user.id, loginRes.refreshToken);
      expect(logoutRes.success).toBe(true);

      // Revoked token cannot be used to refresh
      await expect(authService.refresh(loginRes.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
