import { Injectable } from '@nestjs/common';
import { prisma, Role } from '@shopcloud/database';
import { UserRole, AppPermission } from '@shopcloud/contracts';

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: Object.values(AppPermission),
  STORE_ADMIN: [
    AppPermission.PRODUCTS_READ,
    AppPermission.PRODUCTS_CREATE,
    AppPermission.PRODUCTS_UPDATE,
    AppPermission.PRODUCTS_DELETE,
    AppPermission.CATEGORIES_READ,
    AppPermission.CATEGORIES_CREATE,
    AppPermission.CATEGORIES_UPDATE,
    AppPermission.CATEGORIES_DELETE,
    AppPermission.ORDERS_READ,
    AppPermission.ORDERS_UPDATE,
    AppPermission.ORDERS_CANCEL,
    AppPermission.INVENTORY_READ,
    AppPermission.INVENTORY_UPDATE,
    AppPermission.USERS_READ,
    AppPermission.ADMIN_MANAGE,
  ],
  INVENTORY_MANAGER: [
    AppPermission.PRODUCTS_READ,
    AppPermission.CATEGORIES_READ,
    AppPermission.INVENTORY_READ,
    AppPermission.INVENTORY_UPDATE,
    AppPermission.ORDERS_READ,
  ],
  CUSTOMER: [
    AppPermission.PRODUCTS_READ,
    AppPermission.CATEGORIES_READ,
    AppPermission.CART_READ,
    AppPermission.CART_UPDATE,
    AppPermission.ORDERS_READ,
    AppPermission.ORDERS_CREATE,
    AppPermission.ORDERS_CANCEL,
  ],
  CUSTOMER_SUPPORT: [
    AppPermission.PRODUCTS_READ,
    AppPermission.CATEGORIES_READ,
    AppPermission.ORDERS_READ,
    AppPermission.ORDERS_CANCEL,
    AppPermission.USERS_READ,
  ],
};

@Injectable()
export class PermissionsService {
  async getPermissionsForRole(role: string): Promise<string[]> {
    try {
      const roleEnum = role as Role;
      const rolePerms = await prisma.rolePermission.findMany({
        where: { role: roleEnum },
        include: { permission: true },
      });

      if (rolePerms && rolePerms.length > 0) {
        return rolePerms.map((rp) => rp.permission.name);
      }
    } catch {
      // Fallback to static mapping if database is in mock or offline mode
    }

    return ROLE_PERMISSIONS[role] || [];
  }

  hasPermission(userPermissions: string[], requiredPermission: string, role?: string): boolean {
    if (role === UserRole.SUPER_ADMIN || role === 'SUPER_ADMIN') {
      return true;
    }

    return userPermissions.includes(requiredPermission);
  }

  hasAllPermissions(userPermissions: string[], requiredPermissions: string[], role?: string): boolean {
    if (role === UserRole.SUPER_ADMIN || role === 'SUPER_ADMIN') {
      return true;
    }

    return requiredPermissions.every((perm) => userPermissions.includes(perm));
  }
}
