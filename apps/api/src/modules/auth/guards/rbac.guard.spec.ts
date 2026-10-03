import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from '../permissions.service';
import { UserRole, AppPermission } from '@shopcloud/contracts';

function createMockContext(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RBAC & Permissions Guards', () => {
  let reflector: Reflector;
  let permissionsService: PermissionsService;

  beforeEach(() => {
    reflector = new Reflector();
    permissionsService = new PermissionsService();
  });

  describe('RolesGuard', () => {
    let guard: RolesGuard;

    beforeEach(() => {
      guard = new RolesGuard(reflector);
    });

    it('should allow access if no roles are required', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
      const context = createMockContext({ role: UserRole.CUSTOMER });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should grant SUPER_ADMIN full access regardless of required roles', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.STORE_ADMIN]);
      const context = createMockContext({ role: UserRole.SUPER_ADMIN });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow user possessing the required role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        UserRole.STORE_ADMIN,
        UserRole.INVENTORY_MANAGER,
      ]);
      const context = createMockContext({ role: UserRole.STORE_ADMIN });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject user with insufficient role (ForbiddenException)', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.STORE_ADMIN]);
      const context = createMockContext({ role: UserRole.CUSTOMER });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user context is missing', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.CUSTOMER]);
      const context = createMockContext(null);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('PermissionsGuard', () => {
    let guard: PermissionsGuard;

    beforeEach(() => {
      guard = new PermissionsGuard(reflector, permissionsService);
    });

    it('should allow access when no permissions are required', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
      const context = createMockContext({ role: UserRole.CUSTOMER, permissions: [] });
      expect(await guard.canActivate(context)).toBe(true);
    });

    it('should grant SUPER_ADMIN full access unconditionally', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AppPermission.PRODUCTS_DELETE]);
      const context = createMockContext({ role: UserRole.SUPER_ADMIN, permissions: [] });
      expect(await guard.canActivate(context)).toBe(true);
    });

    it('should allow user when all required permissions are present', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        AppPermission.PRODUCTS_READ,
        AppPermission.CATEGORIES_READ,
      ]);
      const context = createMockContext({
        role: UserRole.CUSTOMER,
        permissions: [AppPermission.PRODUCTS_READ, AppPermission.CATEGORIES_READ],
      });
      expect(await guard.canActivate(context)).toBe(true);
    });

    it('should reject user when a required permission is missing (ForbiddenException)', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        AppPermission.PRODUCTS_CREATE,
      ]);
      const context = createMockContext({
        role: UserRole.CUSTOMER,
        permissions: [AppPermission.PRODUCTS_READ],
      });
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should automatically resolve permissions for role if not in user context', async () => {
      // INVENTORY_MANAGER role includes 'inventory:read' and 'products:read'
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AppPermission.INVENTORY_READ]);
      const context = createMockContext({
        role: UserRole.INVENTORY_MANAGER,
        permissions: undefined,
      });
      expect(await guard.canActivate(context)).toBe(true);
    });
  });
});
