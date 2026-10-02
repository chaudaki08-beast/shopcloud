import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto } from '@shopcloud/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@CurrentUser() user: any) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  async addItem(@CurrentUser() user: any, @Body() dto: AddToCartDto) {
    return this.cartService.addItem(user.id, dto.productId, dto.quantity);
  }

  @Put('items/:productId')
  async updateQuantity(
    @CurrentUser() user: any,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItemQuantity(user.id, productId, dto.quantity);
  }

  @Delete('items/:productId')
  async removeItem(@CurrentUser() user: any, @Param('productId') productId: string) {
    return this.cartService.removeItem(user.id, productId);
  }

  @Delete()
  async clearCart(@CurrentUser() user: any) {
    await this.cartService.clearCart(user.id);
    return { success: true };
  }
}
