import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, OrderStatus, UserRole } from '@shopcloud/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async createOrder(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(user.id, dto);
  }

  @Get()
  async getUserOrders(@CurrentUser() user: any) {
    return this.ordersService.getUserOrders(user.id);
  }

  @Get(':id')
  async getOrderById(@CurrentUser() user: any, @Param('id') orderId: string) {
    const isAdmin = user.role === UserRole.SUPER_ADMIN || user.role === UserRole.STORE_ADMIN;
    return this.ordersService.getOrderById(user.id, orderId, isAdmin);
  }

  @Post(':id/cancel')
  async cancelOrder(@CurrentUser() user: any, @Param('id') orderId: string) {
    // Only permit cancellation if the order belongs to user or is admin
    const isAdmin = user.role === UserRole.SUPER_ADMIN || user.role === UserRole.STORE_ADMIN;
    await this.ordersService.getOrderById(user.id, orderId, isAdmin);
    return this.ordersService.updateOrderStatus(orderId, OrderStatus.CANCELLED);
  }

  @Put(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.CUSTOMER_SUPPORT)
  async updateStatus(@Param('id') orderId: string, @Body('status') status: OrderStatus) {
    return this.ordersService.updateOrderStatus(orderId, status);
  }
}
