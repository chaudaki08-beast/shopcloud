import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus } from '@shopcloud/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  private extractUserId(req: any): string {
    // Identity comes only from the verified JWT (JwtAuthGuard); never from client-supplied headers.
    if (!req.user?.id) throw new UnauthorizedException('Authentication required');
    return req.user.id;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('orders:create')
  @ApiOperation({ summary: 'Create an order from the current cart state' })
  @ApiResponse({ status: 201, description: 'Order created with calculated totals' })
  @ApiResponse({ status: 400, description: 'Empty cart, unavailable product, or insufficient stock' })
  async createOrder(@Req() req: any, @Body() dto: CreateOrderDto) {
    const userId = this.extractUserId(req);
    return this.ordersService.createOrder(userId, dto);
  }

  @Get()
  @RequirePermissions('orders:read')
  @ApiOperation({ summary: 'List all orders for the current user' })
  @ApiResponse({ status: 200, description: 'Array of orders returned' })
  async getUserOrders(@Req() req: any) {
    const userId = this.extractUserId(req);
    return this.ordersService.getUserOrders(userId);
  }

  @Get(':id')
  @RequirePermissions('orders:read')
  @ApiOperation({ summary: 'Get order details by order ID with ownership verification' })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: 'Order details returned' })
  @ApiResponse({ status: 403, description: 'Forbidden: Cannot access another customer order' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderById(@Param('id') orderId: string, @CurrentUser() user: any) {
    return this.ordersService.getOrderById(orderId, user);
  }

  @Patch(':id/status')
  @RequirePermissions('orders:update')
  @ApiOperation({ summary: 'Transition order status through the state machine' })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: 'Order status transitioned successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions to update order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Invalid state machine transition (ORDER_INVALID_STATE_TRANSITION)' })
  async updateStatus(
    @Param('id') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.updateOrderStatus(orderId, dto.status, user);
  }

  @Put(':id/status')
  @RequirePermissions('orders:update')
  @ApiOperation({ summary: 'Transition order status (PUT alias)' })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  async updateStatusPut(
    @Param('id') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.updateOrderStatus(orderId, dto.status, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('orders:cancel')
  @ApiOperation({ summary: 'Cancel an order and release reserved stock' })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: 'Order cancelled and stock released' })
  @ApiResponse({ status: 403, description: 'Forbidden: Cannot cancel another customer order' })
  @ApiResponse({ status: 409, description: 'Cannot cancel order in current state' })
  async cancelOrder(@Param('id') orderId: string, @CurrentUser() user: any) {
    return this.ordersService.updateOrderStatus(orderId, OrderStatus.CANCELLED, user);
  }
}
