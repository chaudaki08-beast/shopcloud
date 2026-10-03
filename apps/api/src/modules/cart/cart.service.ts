import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@shopcloud/database';
import { CartSummaryDto, CartItemDto, ProductDto } from '@shopcloud/contracts';
import { isDatabaseOnline } from '../../db-status';

interface LocalCartItem {
  id: string;
  productId: string;
  quantity: number;
}

const DEMO_PRODUCTS: Record<string, Partial<ProductDto>> = {
  'prod-s25-ultra': {
    id: 'prod-s25-ultra',
    name: 'Samsung Galaxy S25 Ultra 5G',
    slug: 'samsung-galaxy-s25-ultra',
    sku: 'SAM-S25-512-TI',
    price: 12999900,
    discountPercentage: 10,
    stock: 45,
    isActive: true,
  },
  'prod-ip16-pro': {
    id: 'prod-ip16-pro',
    name: 'Apple iPhone 16 Pro Max',
    slug: 'apple-iphone-16-pro-max',
    sku: 'APL-IP16PM-256-DES',
    price: 14490000,
    discountPercentage: 5,
    stock: 3,
    isActive: true,
  },
  'prod-mbp-16': {
    id: 'prod-mbp-16',
    name: 'MacBook Pro 16" (M4 Max)',
    slug: 'macbook-pro-16-m4-max',
    sku: 'APL-MBP16-M4M-36G',
    price: 34990000,
    discountPercentage: 7,
    stock: 15,
    isActive: true,
  },
  'prod-xps-16': {
    id: 'prod-xps-16',
    name: 'Dell XPS 16 OLED Developer Edition',
    slug: 'dell-xps-16-oled',
    sku: 'DEL-XPS16-U9-32G',
    price: 28999900,
    discountPercentage: 12,
    stock: 2,
    isActive: true,
  },
  'prod-wh1000xm5': {
    id: 'prod-wh1000xm5',
    name: 'Sony WH-1000XM5 Wireless Headphones',
    slug: 'sony-wh-1000xm5-silver',
    sku: 'SNY-WH1000XM5-SLV',
    price: 2999000,
    discountPercentage: 15,
    stock: 50,
    isActive: true,
  },
};

@Injectable()
export class CartService {
  private localCarts = new Map<string, LocalCartItem[]>();

  async getCart(userId: string): Promise<CartSummaryDto> {
    if (await isDatabaseOnline()) {
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
        // Fallback
      }
    }

    const items = this.localCarts.get(userId) || [];
    return this.calculateCartSummaryFromLocal(items);
  }

  async addItem(userId: string, productId: string, quantity: number): Promise<CartSummaryDto> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }

    if (await isDatabaseOnline()) {
      try {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
          throw new NotFoundException(`Product '${productId}' not found`);
        }
        if (!product.isActive) {
          throw new BadRequestException(`Product '${product.name}' is inactive and unavailable`);
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

        const targetQuantity = existingItem ? existingItem.quantity + quantity : quantity;
        if (product.stock < targetQuantity) {
          throw new BadRequestException(
            `Insufficient stock: Only ${product.stock} available for '${product.name}'`,
          );
        }

        if (existingItem) {
          await prisma.cartItem.update({
            where: { id: existingItem.id },
            data: { quantity: targetQuantity },
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
      } catch (err) {
        if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      }
    }

    // In-memory fallback
    const product = DEMO_PRODUCTS[productId];
    if (!product) {
      throw new NotFoundException(`Product '${productId}' not found`);
    }
    if (product.isActive === false) {
      throw new BadRequestException(`Product '${product.name}' is inactive and unavailable`);
    }

    const items = this.localCarts.get(userId) || [];
    const existing = items.find((i) => i.productId === productId);
    const targetQuantity = existing ? existing.quantity + quantity : quantity;

    if (product.stock !== undefined && product.stock < targetQuantity) {
      throw new BadRequestException(
        `Insufficient stock: Only ${product.stock} available for '${product.name}'`,
      );
    }

    if (existing) {
      existing.quantity = targetQuantity;
    } else {
      items.push({
        id: `item-${Date.now()}-${productId}`,
        productId,
        quantity,
      });
    }

    this.localCarts.set(userId, items);
    return this.calculateCartSummaryFromLocal(items);
  }

  async updateItemQuantity(userId: string, productId: string, quantity: number): Promise<CartSummaryDto> {
    if (quantity < 1) {
      throw new BadRequestException('Quantity must be at least 1');
    }

    if (await isDatabaseOnline()) {
      try {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
          throw new NotFoundException(`Product '${productId}' not found`);
        }
        if (!product.isActive) {
          throw new BadRequestException(`Product '${product.name}' is inactive`);
        }
        if (product.stock < quantity) {
          throw new BadRequestException(
            `Insufficient stock: Only ${product.stock} available for '${product.name}'`,
          );
        }

        const cart = await prisma.cart.findUnique({ where: { userId } });
        if (!cart) throw new NotFoundException('Cart not found');

        const existingItem = await prisma.cartItem.findUnique({
          where: { cartId_productId: { cartId: cart.id, productId } },
        });
        if (!existingItem) {
          throw new NotFoundException(`Product '${productId}' is not in the cart`);
        }

        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity },
        });

        return this.getCart(userId);
      } catch (err) {
        if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      }
    }

    // In-memory check
    const product = DEMO_PRODUCTS[productId];
    if (!product) throw new NotFoundException(`Product '${productId}' not found`);
    if (product.stock !== undefined && product.stock < quantity) {
      throw new BadRequestException(
        `Insufficient stock: Only ${product.stock} available for '${product.name}'`,
      );
    }

    const items = this.localCarts.get(userId) || [];
    const item = items.find((i) => i.productId === productId);
    if (!item) {
      throw new NotFoundException(`Product '${productId}' is not in the cart`);
    }

    item.quantity = quantity;
    this.localCarts.set(userId, items);
    return this.calculateCartSummaryFromLocal(items);
  }

  async removeItem(userId: string, productId: string): Promise<CartSummaryDto> {
    if (await isDatabaseOnline()) {
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
        // Fallback
      }
    }

    let items = this.localCarts.get(userId) || [];
    items = items.filter((i) => i.productId !== productId);
    this.localCarts.set(userId, items);
    return this.calculateCartSummaryFromLocal(items);
  }

  async clearCart(userId: string): Promise<{ success: boolean; message: string }> {
    if (await isDatabaseOnline()) {
      try {
        const cart = await prisma.cart.findUnique({ where: { userId } });
        if (cart) {
          await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
        }
      } catch {
        // Fallback
      }
    }

    this.localCarts.delete(userId);
    return { success: true, message: 'Cart cleared successfully' };
  }

  /**
   * Authoritative server-side financial calculations:
   * unitPrice, subtotal, discount, 18% GST tax, shipping fee, grandTotal
   */
  private calculateCartSummary(dbItems: any[]): CartSummaryDto {
    let subtotal = 0;
    let discountTotal = 0;

    const formattedItems: CartItemDto[] = dbItems.map((item) => {
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
          discountPercentage,
          stock: product.stock,
          categoryId: product.categoryId,
          isActive: product.isActive,
          attributes: product.attributes || {},
          images: (product.images || []).map((img: any) => ({
            id: img.id,
            url: img.url,
            isPrimary: img.isPrimary,
            altText: img.altText,
          })),
          createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
          updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt,
        },
        quantity: item.quantity,
        unitPrice,
        discountAmount: discountPerUnit * item.quantity,
        lineTotal,
      };
    });

    const discountedSubtotal = subtotal - discountTotal;
    const taxTotal = Math.round(discountedSubtotal * 0.18);
    const shippingFee = dbItems.length === 0 ? 0 : discountedSubtotal > 5000000 ? 0 : 49900;
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

  private calculateCartSummaryFromLocal(items: LocalCartItem[]): CartSummaryDto {
    const populated = items
      .map((item) => {
        const prod = DEMO_PRODUCTS[item.productId];
        if (!prod) return null;
        return {
          id: item.id,
          quantity: item.quantity,
          product: {
            ...prod,
            images: [
              {
                id: 'img-1',
                url: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=800&q=80',
                isPrimary: true,
              },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      })
      .filter(Boolean);

    return this.calculateCartSummary(populated);
  }
}
