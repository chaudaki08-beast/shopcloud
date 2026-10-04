import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma, OrderStatus as PrismaOrderStatus } from '@shopcloud/database';
import {
  OrderResponseDto,
  OrderStatus,
  UserRole,
} from '@shopcloud/contracts';
import { CartService } from '../cart/cart.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStateMachine } from './order-state-machine';
import { useDatabase } from '../../db-status';
import { rethrowInProduction } from '../../common/runtime-mode';

interface StatusTransitionRecord {
  orderId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  timestamp: string;
}

@Injectable()
export class OrdersService {
  private localOrders: OrderResponseDto[] = [];
  private statusHistory: StatusTransitionRecord[] = [];

  constructor(private readonly cartService: CartService) {}

  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderResponseDto> {
    const cartSummary = await this.cartService.getCart(userId);

    if (!cartSummary.items || cartSummary.items.length === 0) {
      throw new BadRequestException('Cannot create an order with an empty cart');
    }

    if (await useDatabase()) {
      try {
        const dbProductCount = await prisma.product.count({
          where: { id: { in: cartSummary.items.map((i) => i.productId) } },
        });

        if (dbProductCount === cartSummary.items.length) {
          const createdOrder = await prisma.$transaction(async (tx) => {
            // 1. Validate & Reserve stock atomically
            for (const item of cartSummary.items) {
              const product = await tx.product.findUnique({
                where: { id: item.productId },
              });

            if (!product || !product.isActive) {
              throw new BadRequestException(
                `Product '${item.product?.name || item.productId}' is unavailable`,
              );
            }

            if (product.stock < item.quantity) {
              throw new BadRequestException(
                `Insufficient stock for '${product.name}'. Requested ${item.quantity}, but only ${product.stock} available.`,
              );
            }

            // Decrement stock
            const updatedProduct = await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } },
            });

            // Record inventory movement
            await tx.inventoryMovement.create({
              data: {
                productId: item.productId,
                changeQuantity: -item.quantity,
                previousStock: product.stock,
                newStock: updatedProduct.stock,
                reason: 'ORDER_RESERVED',
              },
            });
          }

          const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

          // 2. Create Order
          const order = await tx.order.create({
            data: {
              orderNumber,
              userId,
              status: PrismaOrderStatus.CONFIRMED,
              subtotal: cartSummary.subtotal,
              discountTotal: cartSummary.discountTotal,
              taxTotal: cartSummary.taxTotal,
              shippingFee: cartSummary.shippingFee,
              grandTotal: cartSummary.grandTotal,
              currency: cartSummary.currency,
              shippingAddress: dto.shippingAddress as any,
              items: {
                create: cartSummary.items.map((item) => ({
                  productId: item.productId,
                  productName: item.product?.name || 'Product',
                  sku: item.product?.sku || 'SKU',
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  discountAmount: item.discountAmount,
                  lineTotal: item.lineTotal,
                })),
              },
            },
            include: {
              items: true,
              user: true,
            },
          });

          // Link movements to order
          await tx.inventoryMovement.updateMany({
            where: {
              productId: { in: cartSummary.items.map((i) => i.productId) },
              referenceId: null,
              reason: 'ORDER_RESERVED',
            },
            data: { referenceId: order.id },
          });

          // Record initial status transition
          await tx.auditLog.create({
            data: {
              entity: 'Order',
              entityId: order.id,
              action: 'STATUS_TRANSITION',
              metadata: {
                fromStatus: OrderStatus.CHECKOUT,
                toStatus: OrderStatus.CONFIRMED,
              },
            },
          });

          // 3. Clear user's cart
          await tx.cartItem.deleteMany({
            where: { cart: { userId } },
          });

          return order;
        });

        return this.formatOrder(createdOrder);
        }
      } catch (err) {
        rethrowInProduction(err);
        if (err instanceof BadRequestException) throw err;
      }
    }

    // In-memory fallback
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const order: OrderResponseDto = {
      id: `ord-${Date.now()}`,
      orderNumber,
      userId,
      status: OrderStatus.CONFIRMED,
      subtotal: cartSummary.subtotal,
      discountTotal: cartSummary.discountTotal,
      taxTotal: cartSummary.taxTotal,
      shippingFee: cartSummary.shippingFee,
      grandTotal: cartSummary.grandTotal,
      currency: cartSummary.currency,
      shippingAddress: dto.shippingAddress as any,
      paymentId: `pay_mock_${Date.now().toString().slice(-6)}`,
      items: cartSummary.items.map((item) => ({
        id: `ord-item-${Date.now()}-${item.productId}`,
        productId: item.productId,
        productName: item.product?.name || 'Product',
        sku: item.product?.sku || 'SKU',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        lineTotal: item.lineTotal,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.localOrders.unshift(order);
    this.statusHistory.push({
      orderId: order.id,
      fromStatus: OrderStatus.CHECKOUT,
      toStatus: OrderStatus.CONFIRMED,
      timestamp: new Date().toISOString(),
    });

    await this.cartService.clearCart(userId);
    return order;
  }

  async getUserOrders(userId: string): Promise<OrderResponseDto[]> {
    if (await useDatabase()) {
      try {
        const orders = await prisma.order.findMany({
          where: { userId },
          include: { items: true },
          orderBy: { createdAt: 'desc' },
        });

        if (orders && orders.length > 0) {
          return orders.map((o) => this.formatOrder(o));
        }
      } catch (err) {
        rethrowInProduction(err);
        // Fallback
      }
    }

    return this.localOrders.filter(
      (o) => o.userId === userId || userId === 'user-customer',
    );
  }

  async getOrderById(
    orderId: string,
    requestingUser?: { id: string; role?: string },
  ): Promise<OrderResponseDto> {
    let result: OrderResponseDto | null = null;

    if (await useDatabase()) {
      try {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });

        if (order) {
          result = this.formatOrder(order);
        }
      } catch (err) {
        rethrowInProduction(err);
        // Fallback
      }
    }

    if (!result) {
      const fallback = this.localOrders.find((o) => o.id === orderId);
      if (!fallback) {
        throw new NotFoundException(`Order '${orderId}' not found`);
      }
      result = fallback;
    }

    // Strict resource ownership check: Customers can only access their own orders
    if (requestingUser) {
      const isAdmin =
        requestingUser.role === 'SUPER_ADMIN' ||
        requestingUser.role === 'STORE_ADMIN' ||
        requestingUser.role === UserRole.SUPER_ADMIN ||
        requestingUser.role === UserRole.STORE_ADMIN;

      if (!isAdmin && result.userId !== requestingUser.id) {
        throw new ForbiddenException('You do not have permission to access this order');
      }
    }

    return result;
  }

  async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    requestingUser?: { id: string; role?: string },
  ): Promise<OrderResponseDto> {
    const existingOrder = await this.getOrderById(orderId, requestingUser);
    const currentStatus = existingOrder.status;

    // Strict state machine validation: throws InvalidOrderStateTransitionException (HTTP 409) if illegal
    OrderStateMachine.validateTransition(currentStatus, newStatus);

    if (currentStatus === newStatus) {
      return existingOrder; // Idempotent no-op
    }

    if (await useDatabase()) {
      try {
        const orderInDb = await prisma.order.findUnique({ where: { id: orderId } });
        if (orderInDb) {
          if (newStatus === OrderStatus.CANCELLED && currentStatus !== OrderStatus.CANCELLED) {
            await prisma.$transaction(async (tx) => {
              // Release reserved stock back to inventory
              for (const item of existingOrder.items) {
                const product = await tx.product.findUnique({ where: { id: item.productId } });
                if (product) {
                  const updated = await tx.product.update({
                    where: { id: item.productId },
                    data: { stock: { increment: item.quantity } },
                  });
                  await tx.inventoryMovement.create({
                    data: {
                      productId: item.productId,
                      changeQuantity: item.quantity,
                      previousStock: product.stock,
                      newStock: updated.stock,
                      reason: 'ORDER_CANCELLED_RELEASE',
                      referenceId: existingOrder.id,
                    },
                  });
                }
              }

              await tx.order.update({
                where: { id: orderId },
                data: { status: PrismaOrderStatus.CANCELLED },
              });

              await tx.auditLog.create({
                data: {
                  entity: 'Order',
                  entityId: orderId,
                  action: 'STATUS_TRANSITION',
                  metadata: {
                    fromStatus: currentStatus,
                    toStatus: newStatus,
                  },
                },
              });
            });
          } else {
            await prisma.$transaction(async (tx) => {
              await tx.order.update({
                where: { id: orderId },
                data: { status: newStatus as unknown as PrismaOrderStatus },
              });

              await tx.auditLog.create({
                data: {
                  entity: 'Order',
                  entityId: orderId,
                  action: 'STATUS_TRANSITION',
                  metadata: {
                    fromStatus: currentStatus,
                    toStatus: newStatus,
                  },
                },
              });
            });
          }

          return this.getOrderById(orderId);
        }
      } catch (err) {
        rethrowInProduction(err);
        // Fallback
      }
    }

    const orderIndex = this.localOrders.findIndex((o) => o.id === orderId);
    if (orderIndex !== -1) {
      this.localOrders[orderIndex].status = newStatus;
      this.localOrders[orderIndex].updatedAt = new Date().toISOString();
      this.statusHistory.push({
        orderId,
        fromStatus: currentStatus,
        toStatus: newStatus,
        timestamp: new Date().toISOString(),
      });
      return this.localOrders[orderIndex];
    }

    throw new NotFoundException(`Order '${orderId}' not found`);
  }

  async getStatusHistory(orderId: string): Promise<StatusTransitionRecord[]> {
    return this.statusHistory.filter((h) => h.orderId === orderId);
  }

  private formatOrder(order: any): OrderResponseDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: order.status as OrderStatus,
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      taxTotal: order.taxTotal,
      shippingFee: order.shippingFee,
      grandTotal: order.grandTotal,
      currency: order.currency,
      shippingAddress: order.shippingAddress as any,
      paymentId: order.paymentId || undefined,
      trackingNumber: order.trackingNumber || undefined,
      items: (order.items || []).map((i: any) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountAmount: i.discountAmount,
        lineTotal: i.lineTotal,
      })),
      createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
      updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
    };
  }
}
