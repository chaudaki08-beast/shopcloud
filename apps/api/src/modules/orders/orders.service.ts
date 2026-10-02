import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma, OrderStatus as PrismaOrderStatus } from '@shopcloud/database';
import {
  CreateOrderDto,
  OrderResponseDto,
  OrderStatus,
  PubSubTopic,
  OrderCreatedEvent,
} from '@shopcloud/contracts';
import { CartService } from '../cart/cart.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly cartService: CartService,
    private readonly eventsService: EventsService,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderResponseDto> {
    const cartSummary = await this.cartService.getCart(userId);

    if (cartSummary.items.length === 0) {
      throw new BadRequestException('Cannot create an order with an empty cart');
    }

    // ACID Transaction for stock reservation and order creation
    const createdOrder = await prisma.$transaction(async (tx) => {
      // 1. Validate & Reserve stock atomically
      for (const item of cartSummary.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product || !product.isActive) {
          throw new BadRequestException(`Product ${item.product?.name || item.productId} is unavailable`);
        }

        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for '${product.name}'. Requested ${item.quantity}, but only ${product.stock} left.`,
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

      // Generate order number (e.g. ORD-202610-8492)
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 2. Create Order
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId,
          status: PrismaOrderStatus.PAYMENT_PENDING,
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

      // Update referenceId on movements
      await tx.inventoryMovement.updateMany({
        where: {
          productId: { in: cartSummary.items.map((i) => i.productId) },
          referenceId: null,
          reason: 'ORDER_RESERVED',
        },
        data: { referenceId: order.id },
      });

      // 3. Clear user's cart
      await tx.cartItem.deleteMany({
        where: { cart: { userId } },
      });

      return order;
    });

    // 4. Publish Event to Pub/Sub asynchronously outside transaction
    const orderCreatedEvent: OrderCreatedEvent = {
      orderId: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      userId: createdOrder.userId,
      userEmail: createdOrder.user.email,
      items: createdOrder.items.map((i) => ({
        productId: i.productId,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      totalAmount: createdOrder.grandTotal,
      currency: createdOrder.currency,
      createdAt: createdOrder.createdAt.toISOString(),
    };

    await this.eventsService.publish(
      PubSubTopic.ORDER_CREATED,
      orderCreatedEvent,
      'shopcloud.order.created',
    );

    return this.formatOrder(createdOrder);
  }

  async getUserOrders(userId: string): Promise<OrderResponseDto[]> {
    const orders = await prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((o) => this.formatOrder(o));
  }

  async getOrderById(userId: string, orderId: string, isAdmin = false): Promise<OrderResponseDto> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!isAdmin && order.userId !== userId) {
      throw new ForbiddenException('Access denied to this order');
    }

    return this.formatOrder(order);
  }

  async updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<OrderResponseDto> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    // If order is cancelled and was previously reserved, release inventory
    if (newStatus === OrderStatus.CANCELLED && order.status !== PrismaOrderStatus.CANCELLED) {
      await prisma.$transaction(async (tx) => {
        for (const item of order.items) {
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
                referenceId: order.id,
              },
            });
          }
        }

        await tx.order.update({
          where: { id: orderId },
          data: { status: PrismaOrderStatus.CANCELLED },
        });
      });
    } else {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: newStatus as unknown as PrismaOrderStatus },
      });
    }

    const updated = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    return this.formatOrder(updated);
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
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}
