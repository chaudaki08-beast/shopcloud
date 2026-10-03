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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus } from '@shopcloud/contracts';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  private extractUserId(req: any): string {
    return req.user?.id || req.headers['x-user-id'] || 'user-customer';
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an order from the current cart state' })
  @ApiResponse({ status: 201, description: 'Order created with calculated totals' })
  @ApiResponse({ status: 400, description: 'Empty cart, unavailable product, or insufficient stock' })
  async createOrder(@Req() req: any, @Body() dto: CreateOrderDto) {
    const userId = this.extractUserId(req);
    return this.ordersService.createOrder(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all orders for the current user' })
  @ApiResponse({ status: 200, description: 'Array of orders returned' })
  async getUserOrders(@Req() req: any) {
    const userId = this.extractUserId(req);
    return this.ordersService.getUserOrders(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details by order ID' })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: 'Order details returned' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderById(@Param('id') orderId: string) {
    return this.ordersService.getOrderById(orderId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transition order status through the state machine' })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: 'Order status transitioned successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Invalid state machine transition (ORDER_INVALID_STATE_TRANSITION)' })
  async updateStatus(
    @Param('id') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(orderId, dto.status);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Transition order status (PUT alias)' })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  async updateStatusPut(
    @Param('id') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(orderId, dto.status);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an order and release reserved stock' })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: 'Order cancelled and stock released' })
  @ApiResponse({ status: 409, description: 'Cannot cancel order in current state' })
  async cancelOrder(@Param('id') orderId: string) {
    return this.ordersService.updateOrderStatus(orderId, OrderStatus.CANCELLED);
  }
}
