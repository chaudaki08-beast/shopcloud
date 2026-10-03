import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@shopcloud/contracts';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionsService } from '../permissions.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('User context missing');
    }

    if (user.role === UserRole.SUPER_ADMIN || user.role === 'SUPER_ADMIN') {
      return true;
    }

    let userPermissions: string[] = user.permissions;
    if (!userPermissions || userPermissions.length === 0) {
      userPermissions = await this.permissionsService.getPermissionsForRole(user.role);
    }

    const hasAll = this.permissionsService.hasAllPermissions(
      userPermissions,
      requiredPermissions,
      user.role,
    );

    if (!hasAll) {
      throw new ForbiddenException(
        `Insufficient permissions: Requires [${requiredPermissions.join(', ')}]`,
      );
    }

    return true;
  }
}
