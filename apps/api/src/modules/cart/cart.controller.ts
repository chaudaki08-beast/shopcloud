import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Cart')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private extractUserId(req: any): string {
    return req.user?.id || req.headers?.['x-user-id'] || 'user-customer';
  }

  @Get()
  @RequirePermissions('cart:read')
  @ApiOperation({ summary: 'Get current user cart with authoritative server-side calculations' })
  @ApiResponse({ status: 200, description: 'Cart summary returned with calculated totals' })
  async getCart(@Req() req: any) {
    const userId = this.extractUserId(req);
    return this.cartService.getCart(userId);
  }

  @Post('items')
  @RequirePermissions('cart:update')
  @ApiOperation({ summary: 'Add a product to the cart' })
  @ApiResponse({ status: 201, description: 'Product added and updated cart returned' })
  @ApiResponse({ status: 400, description: 'Invalid quantity, inactive product, or insufficient stock' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async addItem(@Req() req: any, @Body() dto: AddToCartDto) {
    const userId = this.extractUserId(req);
    return this.cartService.addItem(userId, dto.productId, dto.quantity);
  }

  @Patch('items/:productId')
  @RequirePermissions('cart:update')
  @ApiOperation({ summary: 'Update item quantity in cart' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Item quantity updated and cart recalculated' })
  @ApiResponse({ status: 400, description: 'Invalid quantity or insufficient stock' })
  @ApiResponse({ status: 404, description: 'Item not in cart' })
  async updateQuantity(
    @Req() req: any,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const userId = this.extractUserId(req);
    return this.cartService.updateItemQuantity(userId, productId, dto.quantity);
  }

  @Put('items/:productId')
  @RequirePermissions('cart:update')
  @ApiOperation({ summary: 'Update item quantity in cart (PUT alias)' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  async updateQuantityPut(
    @Req() req: any,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const userId = this.extractUserId(req);
    return this.cartService.updateItemQuantity(userId, productId, dto.quantity);
  }

  @Delete('items/:productId')
  @RequirePermissions('cart:update')
  @ApiOperation({ summary: 'Remove a specific item from cart' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Item removed from cart' })
  async removeItem(@Req() req: any, @Param('productId') productId: string) {
    const userId = this.extractUserId(req);
    return this.cartService.removeItem(userId, productId);
  }

  @Delete()
  @RequirePermissions('cart:update')
  @ApiOperation({ summary: 'Clear all items from the cart' })
  @ApiResponse({ status: 200, description: 'Cart cleared successfully' })
  async clearCart(@Req() req: any) {
    const userId = this.extractUserId(req);
    return this.cartService.clearCart(userId);
  }
}
