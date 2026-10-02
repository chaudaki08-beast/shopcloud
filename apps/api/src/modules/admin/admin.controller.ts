import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { UserRole } from '@shopcloud/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.INVENTORY_MANAGER)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  async getDashboard() {
    return this.adminService.getDashboardMetrics();
  }
}
