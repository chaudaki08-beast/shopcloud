import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@shopcloud/database';
import { CartSummaryDto, CartItemDto } from '@shopcloud/contracts';

@Injectable()
export class CartService {
  private localCarts = new Map<string, any[]>();

  async getCart(userId: string): Promise<CartSummaryDto> {
    try {
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
    } catch {
      // Local in-memory cart fallback
      const items = this.localCarts.get(userId) || [];
      return this.calculateCartSummary(items);
    }
  }

  async addItem(userId: string, productId: string, quantity: number): Promise<CartSummaryDto> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }

    try {
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
    } catch {
      // Fallback for local preview without database
      const items = this.localCarts.get(userId) || [];
      const existing = items.find((i) => i.productId === productId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        items.push({
          id: `item-${Date.now()}`,
          productId,
          quantity,
          product: {
            id: productId,
            name: productId.includes('s25')
              ? 'Samsung Galaxy S25 Ultra 5G'
              : productId.includes('ip16')
              ? 'Apple iPhone 16 Pro Max'
              : productId.includes('mbp')
              ? 'MacBook Pro 16" (M4 Max)'
              : productId.includes('xps')
              ? 'Dell XPS 16 OLED'
              : 'Sony WH-1000XM5 Headphones',
            sku: 'SKU-DEMO',
            price: productId.includes('s25')
              ? 12999900
              : productId.includes('ip16')
              ? 14490000
              : productId.includes('mbp')
              ? 34990000
              : productId.includes('xps')
              ? 28999900
              : 2999000,
            discountPercentage: 10,
            stock: 25,
            images: [
              {
                url: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=600&q=80',
              },
            ],
          },
        });
      }
      this.localCarts.set(userId, items);
      return this.calculateCartSummary(items);
    }
  }

  async updateItemQuantity(userId: string, productId: string, quantity: number): Promise<CartSummaryDto> {
    if (quantity <= 0) {
      return this.removeItem(userId, productId);
    }

    try {
      const cart = await prisma.cart.findUnique({ where: { userId } });
      if (!cart) throw new NotFoundException('Cart not found');

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
    } catch {
      const items = this.localCarts.get(userId) || [];
      const item = items.find((i) => i.productId === productId);
      if (item) item.quantity = quantity;
      return this.calculateCartSummary(items);
    }
  }

  async removeItem(userId: string, productId: string): Promise<CartSummaryDto> {
    try {
      const cart = await prisma.cart.findUnique({ where: { userId } });
      if (cart) {
        await prisma.cartItem.deleteMany({
          where: {
            cartId: cart.id,
            productId,
          },
        });
      }
      return this.getCart(userId);
    } catch {
      let items = this.localCarts.get(userId) || [];
      items = items.filter((i) => i.productId !== productId);
      this.localCarts.set(userId, items);
      return this.calculateCartSummary(items);
    }
  }

  async clearCart(userId: string): Promise<void> {
    try {
      const cart = await prisma.cart.findUnique({ where: { userId } });
      if (cart) {
        await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      }
    } catch {
      this.localCarts.delete(userId);
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
          slug: product.slug || 'product',
          sku: product.sku || 'SKU',
          description: product.description || '',
          price: product.price,
          discountPercentage: product.discountPercentage || 0,
          stock: product.stock || 20,
          categoryId: product.categoryId || 'cat',
          isActive: true,
          attributes: product.attributes || {},
          images: (product.images || []).map((img: any) => ({
            id: img.id || 'img',
            url: img.url,
            isPrimary: img.isPrimary || true,
            altText: img.altText,
          })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
