import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@shopcloud/database';
import { CartSummaryDto, CartItemDto } from '@shopcloud/contracts';

@Injectable()
export class CartService {
  async getCart(userId: string): Promise<CartSummaryDto> {
    let cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: { images: true },
            },
          },
        },
      },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId },
        include: {
          items: {
            include: {
              product: {
                include: { images: true },
              },
            },
          },
        },
      });
    }

    return this.calculateCartSummary(cart.items);
  }

  async addItem(userId: string, productId: string, quantity: number): Promise<CartSummaryDto> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found or unavailable');
    }

    if (product.stock < quantity) {
      throw new BadRequestException(`Insufficient stock: Only ${product.stock} available`);
    }

    let cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) {
      cart = await prisma.cart.create({ data: { userId } });
    }

    const existingItem = await prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (product.stock < newQuantity) {
        throw new BadRequestException(`Insufficient stock: Only ${product.stock} available`);
      }
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          quantity,
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItemQuantity(userId: string, productId: string, quantity: number): Promise<CartSummaryDto> {
    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new NotFoundException('Cart not found');

    if (quantity <= 0) {
      return this.removeItem(userId, productId);
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    if (product.stock < quantity) {
      throw new BadRequestException(`Insufficient stock: Only ${product.stock} available`);
    }

    await prisma.cartItem.upsert({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
      update: { quantity },
      create: {
        cartId: cart.id,
        productId,
        quantity,
      },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, productId: string): Promise<CartSummaryDto> {
    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) return this.getCart(userId);

    await prisma.cartItem.deleteMany({
      where: {
        cartId: cart.id,
        productId,
      },
    });

    return this.getCart(userId);
  }

  async clearCart(userId: string): Promise<void> {
    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
  }

  private calculateCartSummary(items: any[]): CartSummaryDto {
    let subtotal = 0;
    let discountTotal = 0;

    const formattedItems: CartItemDto[] = items.map((item) => {
      const product = item.product;
      const unitPrice = product.price;
      const discountPercentage = product.discountPercentage || 0;
      const discountPerUnit = Math.round((unitPrice * discountPercentage) / 100);
      const discountedUnitPrice = unitPrice - discountPerUnit;
      const lineTotal = discountedUnitPrice * item.quantity;

      subtotal += unitPrice * item.quantity;
      discountTotal += discountPerUnit * item.quantity;

      return {
        id: item.id,
        productId: product.id,
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          description: product.description,
          price: product.price,
          discountPercentage: product.discountPercentage,
          stock: product.stock,
          categoryId: product.categoryId,
          isActive: product.isActive,
          attributes: product.attributes,
          images: product.images.map((img: any) => ({
            id: img.id,
            url: img.url,
            isPrimary: img.isPrimary,
            altText: img.altText,
          })),
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        },
        quantity: item.quantity,
        unitPrice,
        discountAmount: discountPerUnit * item.quantity,
        lineTotal,
      };
    });

    const discountedSubtotal = subtotal - discountTotal;
    // 18% GST on discounted subtotal
    const taxTotal = Math.round(discountedSubtotal * 0.18);
    // Shipping: Free if subtotal > ₹50,000 (5000000 paise), else ₹499 (49900 paise), 0 if empty cart
    const shippingFee = items.length === 0 ? 0 : discountedSubtotal > 5000000 ? 0 : 49900;
    const grandTotal = discountedSubtotal + taxTotal + shippingFee;

    return {
      items: formattedItems,
      subtotal,
      discountTotal,
      taxTotal,
      shippingFee,
      grandTotal,
      currency: 'INR',
    };
  }
}
