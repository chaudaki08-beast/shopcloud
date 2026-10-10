import { OrdersService } from './orders.service';
import { CartService } from '../cart/cart.service';
import { OutboxService } from '../events/outbox.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@shopcloud/contracts';
import { InvalidOrderStateTransitionException } from './order-state-machine';

describe('OrdersService', () => {
  let ordersService: OrdersService;
  let cartService: CartService;
  let outboxService: any;
  const testUserId = 'test-order-user-1';

  beforeEach(() => {
    cartService = new CartService();
    outboxService = {
      recordEvent: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      dispatchImmediate: jest.fn().mockResolvedValue(true),
    };
    ordersService = new OrdersService(cartService, outboxService as OutboxService);
  });

  const validShippingAddress = {
    recipientName: 'Ganesh Chaudaki',
    phoneNumber: '+91 98765 43210',
    street: '123 Cloud Avenue',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'India',
  };

  describe('createOrder', () => {
    it('should reject order creation if cart is empty (BadRequestException)', async () => {
      await expect(
        ordersService.createOrder(testUserId, {
          shippingAddress: validShippingAddress,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create an order with authoritative prices and clear user cart', async () => {
      // 1. Populate cart
      await cartService.addItem(testUserId, 'prod-s25-ultra', 1);

      // 2. Create order
      const order = await ordersService.createOrder(testUserId, {
        shippingAddress: validShippingAddress,
      });

      expect(order.id).toBeDefined();
      expect(order.orderNumber).toMatch(/^ORD-/);
      expect(order.status).toBe(OrderStatus.CONFIRMED);
      expect(order.items.length).toBe(1);
      expect(order.items[0].productId).toBe('prod-s25-ultra');
      expect(order.grandTotal).toBeGreaterThan(0);

      // 3. Verify cart was emptied
      const cartAfter = await cartService.getCart(testUserId);
      expect(cartAfter.items.length).toBe(0);
    });
  });

  describe('getOrderById & getUserOrders', () => {
    it('should retrieve placed orders by user ID and order ID', async () => {
      await cartService.addItem(testUserId, 'prod-s25-ultra', 1);
      const placed = await ordersService.createOrder(testUserId, {
        shippingAddress: validShippingAddress,
      });

      const userOrders = await ordersService.getUserOrders(testUserId);
      expect(userOrders.some((o) => o.id === placed.id)).toBe(true);

      const byId = await ordersService.getOrderById(placed.id);
      expect(byId.orderNumber).toBe(placed.orderNumber);
    });

    it('should throw NotFoundException for unknown order ID', async () => {
      await expect(ordersService.getOrderById('non-existent-order-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateOrderStatus via State Machine', () => {
    it('should successfully advance through valid order lifecycle', async () => {
      await cartService.addItem(testUserId, 'prod-s25-ultra', 1);
      const order = await ordersService.createOrder(testUserId, {
        shippingAddress: validShippingAddress,
      });

      // CONFIRMED -> PROCESSING
      const processing = await ordersService.updateOrderStatus(order.id, OrderStatus.PROCESSING);
      expect(processing.status).toBe(OrderStatus.PROCESSING);

      // PROCESSING -> SHIPPED
      const shipped = await ordersService.updateOrderStatus(order.id, OrderStatus.SHIPPED);
      expect(shipped.status).toBe(OrderStatus.SHIPPED);

      // SHIPPED -> OUT_FOR_DELIVERY
      const out = await ordersService.updateOrderStatus(order.id, OrderStatus.OUT_FOR_DELIVERY);
      expect(out.status).toBe(OrderStatus.OUT_FOR_DELIVERY);

      // OUT_FOR_DELIVERY -> DELIVERED
      const delivered = await ordersService.updateOrderStatus(order.id, OrderStatus.DELIVERED);
      expect(delivered.status).toBe(OrderStatus.DELIVERED);
    });

    it('should reject invalid transition from DELIVERED to PROCESSING (HTTP 409 Conflict)', async () => {
      await cartService.addItem(testUserId, 'prod-s25-ultra', 1);
      const order = await ordersService.createOrder(testUserId, {
        shippingAddress: validShippingAddress,
      });

      await ordersService.updateOrderStatus(order.id, OrderStatus.PROCESSING);
      await ordersService.updateOrderStatus(order.id, OrderStatus.SHIPPED);
      await ordersService.updateOrderStatus(order.id, OrderStatus.OUT_FOR_DELIVERY);
      await ordersService.updateOrderStatus(order.id, OrderStatus.DELIVERED);

      // Illegal step: DELIVERED -> PROCESSING
      await expect(
        ordersService.updateOrderStatus(order.id, OrderStatus.PROCESSING),
      ).rejects.toThrow(InvalidOrderStateTransitionException);
    });

    it('should allow cancellation from CONFIRMED', async () => {
      await cartService.addItem(testUserId, 'prod-s25-ultra', 1);
      const order = await ordersService.createOrder(testUserId, {
        shippingAddress: validShippingAddress,
      });

      const cancelled = await ordersService.updateOrderStatus(order.id, OrderStatus.CANCELLED);
      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    });
  });
});
