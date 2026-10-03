import { CartService } from './cart.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('CartService', () => {
  let service: CartService;
  const testUserId = 'test-cart-user-1';

  beforeEach(() => {
    service = new CartService();
  });

  describe('Financial Calculations (Server-side Authoritative)', () => {
    it('should accurately calculate subtotal, discount, GST, and shipping', () => {
      const mockItems = [
        {
          id: 'item-1',
          quantity: 1,
          product: {
            id: 'prod-1',
            name: 'Samsung Galaxy Phone',
            sku: 'SAM-PHONE',
            description: 'Flagship phone',
            price: 5000000, // ₹50,000.00 in paise
            discountPercentage: 10, // 10% discount = ₹5,000.00
            stock: 20,
            categoryId: 'cat-1',
            isActive: true,
            attributes: {},
            images: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ];

      const summary = (service as any).calculateCartSummary(mockItems);

      expect(summary.subtotal).toBe(5000000);
      expect(summary.discountTotal).toBe(500000);
      expect(summary.taxTotal).toBe(810000);
      expect(summary.shippingFee).toBe(49900);
      expect(summary.grandTotal).toBe(5359900);
    });

    it('should provide free shipping if discounted subtotal exceeds ₹50,000 threshold', () => {
      const mockItems = [
        {
          id: 'item-2',
          quantity: 1,
          product: {
            id: 'prod-2',
            name: 'MacBook Pro M4',
            sku: 'APL-MBP',
            description: 'High-end laptop',
            price: 20000000,
            discountPercentage: 0,
            stock: 10,
            categoryId: 'cat-2',
            isActive: true,
            attributes: {},
            images: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ];

      const summary = (service as any).calculateCartSummary(mockItems);
      expect(summary.shippingFee).toBe(0);
    });
  });

  describe('Cart Item Operations & Business Rules', () => {
    it('should add a valid product to cart', async () => {
      const cart = await service.addItem(testUserId, 'prod-s25-ultra', 1);

      expect(cart.items.length).toBe(1);
      expect(cart.items[0].productId).toBe('prod-s25-ultra');
      expect(cart.items[0].quantity).toBe(1);
      expect(cart.grandTotal).toBeGreaterThan(0);
    });

    it('should reject adding non-existent product (NotFoundException)', async () => {
      await expect(service.addItem(testUserId, 'non-existent-product', 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject quantity <= 0 (BadRequestException)', async () => {
      await expect(service.addItem(testUserId, 'prod-s25-ultra', 0)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.addItem(testUserId, 'prod-s25-ultra', -2)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject quantity exceeding available stock (BadRequestException)', async () => {
      // prod-ip16-pro has stock: 3
      await expect(service.addItem(testUserId, 'prod-ip16-pro', 99)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should update item quantity in cart', async () => {
      await service.addItem(testUserId, 'prod-s25-ultra', 1);
      const updated = await service.updateItemQuantity(testUserId, 'prod-s25-ultra', 2);

      const item = updated.items.find((i) => i.productId === 'prod-s25-ultra');
      expect(item?.quantity).toBe(2);
    });

    it('should remove item from cart', async () => {
      await service.addItem(testUserId, 'prod-s25-ultra', 1);
      const updated = await service.removeItem(testUserId, 'prod-s25-ultra');

      const item = updated.items.find((i) => i.productId === 'prod-s25-ultra');
      expect(item).toBeUndefined();
    });

    it('should clear all items from cart', async () => {
      await service.addItem(testUserId, 'prod-s25-ultra', 1);
      await service.clearCart(testUserId);

      const emptyCart = await service.getCart(testUserId);
      expect(emptyCart.items.length).toBe(0);
      expect(emptyCart.grandTotal).toBe(0);
    });
  });
});
