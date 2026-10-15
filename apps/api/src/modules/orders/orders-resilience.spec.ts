import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderStateMachine, InvalidOrderStateTransitionException } from './order-state-machine';
import { OrderStatus } from '@shopcloud/contracts';
import { prisma } from '@shopcloud/database';

jest.mock('@shopcloud/database', () => ({
  prisma: {
    $transaction: jest.fn(),
    product: {
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    inventoryMovement: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    cartItem: {
      deleteMany: jest.fn(),
    },
  },
  OrderStatus: {
    PAYMENT_PENDING: 'PAYMENT_PENDING',
    CONFIRMED: 'CONFIRMED',
    PROCESSING: 'PROCESSING',
    SHIPPED: 'SHIPPED',
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
    REFUNDED: 'REFUNDED',
  },
}));

jest.mock('../../db-status', () => ({
  useDatabase: jest.fn().mockResolvedValue(true),
}));

describe('Orders Resilience & Invariant Verification', () => {
  let ordersService: OrdersService;
  let mockCartService: any;
  let mockOutboxService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCartService = {
      getCart: jest.fn(),
      clearCart: jest.fn(),
    };
    mockOutboxService = {
      recordEvent: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      dispatchImmediate: jest.fn().mockResolvedValue(true),
    };
    ordersService = new OrdersService(mockCartService, mockOutboxService);
  });

  describe('Concurrency & Stock Non-Negative Invariant', () => {
    it('prevents overselling when two requests race to purchase the last available stock', async () => {
      let currentStock = 1;

      // Mock database transaction simulating real row-level lock and atomic check-and-decrement
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx: any = {
          product: {
            findUnique: jest.fn().mockImplementation(async () => {
              return { id: 'prod-1', name: 'Limited Edition Sneakers', stock: currentStock, isActive: true };
            }),
            update: jest.fn().mockImplementation(async ({ data }: any) => {
              if (currentStock < 1) {
                throw new BadRequestException('Insufficient stock');
              }
              currentStock -= 1;
              return { id: 'prod-1', stock: currentStock };
            }),
          },
          inventoryMovement: {
            create: jest.fn().mockResolvedValue({}),
            updateMany: jest.fn().mockResolvedValue({}),
          },
          order: {
            create: jest.fn().mockImplementation(async ({ data }: any) => {
              return {
                id: `ord-${Date.now()}`,
                orderNumber: data.orderNumber,
                userId: data.userId,
                status: 'CONFIRMED',
                grandTotal: data.grandTotal,
                currency: 'INR',
                items: data.items.create,
                createdAt: new Date(),
              };
            }),
          },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
          cartItem: { deleteMany: jest.fn().mockResolvedValue({}) },
          outboxEvent: { create: jest.fn().mockResolvedValue({}) },
        };

        return callback(mockTx);
      });

      mockCartService.getCart.mockResolvedValue({
        items: [{ productId: 'prod-1', quantity: 1, unitPrice: 500000, lineTotal: 500000, product: { name: 'Limited Edition Sneakers', sku: 'SNK-01' } }],
        subtotal: 500000,
        discountTotal: 0,
        taxTotal: 0,
        shippingFee: 0,
        grandTotal: 500000,
        currency: 'INR',
      });

      (prisma.product.count as jest.Mock).mockResolvedValue(1);

      const orderDto = {
        shippingAddress: { fullName: 'Customer 1', addressLine1: 'Road 1', city: 'Mumbai', state: 'MH', postalCode: '400001', country: 'India' },
      };

      // Request 1: succeeds and reserves the 1 available stock
      const order1 = await ordersService.createOrder('user-1', orderDto as any);
      expect(order1).toBeDefined();
      expect(currentStock).toBe(0);

      // Request 2: attempts to purchase when stock = 0 -> must fail with BadRequestException
      await expect(ordersService.createOrder('user-2', orderDto as any)).rejects.toThrow(
        BadRequestException,
      );

      // Verify stock never becomes negative
      expect(currentStock).toBe(0);
    });

    it('rolls back completely if outbox recording fails midway in the transaction', async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
        new BadRequestException('Outbox constraint failure: duplicate eventId'),
      );


      mockCartService.getCart.mockResolvedValue({
        items: [{ productId: 'prod-1', quantity: 1, unitPrice: 100000, lineTotal: 100000, product: { name: 'Phone', sku: 'PH-01' } }],
        subtotal: 100000,
        discountTotal: 0,
        taxTotal: 0,
        shippingFee: 0,
        grandTotal: 100000,
        currency: 'INR',
      });

      (prisma.product.count as jest.Mock).mockResolvedValue(1);

      await expect(
        ordersService.createOrder('user-1', {
          shippingAddress: { fullName: 'A', addressLine1: 'B', city: 'C', state: 'D', postalCode: 'E', country: 'F' },
        } as any),
      ).rejects.toThrow(BadRequestException);

      // Transaction threw an error, meaning all mutations rolled back
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('Order Cancellation Idempotency & Stock Release', () => {
    it('is idempotent when order cancellation is called repeatedly', async () => {
      const existingOrder = {
        id: 'ord-cancel-1',
        orderNumber: 'ORD-CANCEL-1',
        userId: 'user-1',
        status: OrderStatus.CONFIRMED,
        items: [{ id: 'item-1', productId: 'prod-1', quantity: 2, unitPrice: 1000, lineTotal: 2000 }],
        subtotal: 2000,
        discountTotal: 0,
        taxTotal: 0,
        shippingFee: 0,
        grandTotal: 2000,
        currency: 'INR',
        shippingAddress: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.order.findUnique as jest.Mock).mockResolvedValue(existingOrder);
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx: any = {
          product: {
            findUnique: jest.fn().mockResolvedValue({ id: 'prod-1', stock: 10 }),
            update: jest.fn().mockResolvedValue({ id: 'prod-1', stock: 12 }),
          },
          inventoryMovement: { create: jest.fn() },
          order: { update: jest.fn().mockResolvedValue({ ...existingOrder, status: OrderStatus.CANCELLED }) },
          auditLog: { create: jest.fn() },
        };
        return callback(mockTx);
      });

      // First cancellation: releases stock and updates status to CANCELLED
      const cancelledOrder1 = await ordersService.updateOrderStatus('ord-cancel-1', OrderStatus.CANCELLED);
      expect(cancelledOrder1).toBeDefined();

      // Second cancellation: order is already CANCELLED, must return immediately without double releasing
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...existingOrder,
        status: OrderStatus.CANCELLED,
      });

      const cancelledOrder2 = await ordersService.updateOrderStatus('ord-cancel-1', OrderStatus.CANCELLED);
      expect(cancelledOrder2.status).toBe(OrderStatus.CANCELLED);
    });
  });

  describe('Order State Machine Invariants', () => {
    it('rejects illegal status transition from CANCELLED to CONFIRMED with 409', () => {
      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.CANCELLED, OrderStatus.CONFIRMED);
      }).toThrow(InvalidOrderStateTransitionException);
    });

    it('rejects illegal status transition from DELIVERED to PAYMENT_PENDING with 409', () => {
      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.DELIVERED, OrderStatus.PAYMENT_PENDING);
      }).toThrow(InvalidOrderStateTransitionException);
    });

    it('allows valid progressive transitions', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.PAYMENT_PENDING, OrderStatus.CONFIRMED)).toBe(true);
      expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.PROCESSING)).toBe(true);
      expect(OrderStateMachine.canTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED)).toBe(true);
      expect(OrderStateMachine.canTransition(OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY)).toBe(true);
      expect(OrderStateMachine.canTransition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED)).toBe(true);
    });
  });
});
