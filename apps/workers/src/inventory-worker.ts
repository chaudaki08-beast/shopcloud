import { prisma } from '@shopcloud/database';
import {
  EventEnvelope,
  EVENT_TYPES,
  OrderCreatedPayload,
  InventoryReservationRequestedPayload,
  InventoryReleasedPayload,
  InventoryReservedPayload,
  NotificationRequestedPayload,
} from '@shopcloud/contracts';
import { WorkerEventPublisher } from './event-publisher';

export class InventoryWorker {
  static readonly CONSUMER_NAME = 'inventory-worker';

  /**
   * Handles order creation by validating stock and atomically reserving inventory.
   * Guarantees idempotency via the ProcessedEvent ledger.
   */
  static async handleOrderCreated(
    envelope: EventEnvelope<OrderCreatedPayload>,
  ): Promise<{ status: string; eventId: string; reserved: boolean }> {
    const startTime = Date.now();
    const { payload, eventId, correlationId } = envelope;

    console.log(
      `[InventoryWorker] Processing OrderCreated [${payload.orderNumber}] (eventId: ${eventId}, correlationId: ${correlationId})`,
    );

    // 1. Durable Idempotency Check
    const alreadyProcessed = await prisma.processedEvent.findUnique({
      where: {
        eventId_consumer: {
          eventId,
          consumer: this.CONSUMER_NAME,
        },
      },
    });

    if (alreadyProcessed) {
      console.log(
        `[InventoryWorker] [IDEMPOTENT_SKIP] Event ${eventId} already processed by ${this.CONSUMER_NAME} at ${alreadyProcessed.processedAt.toISOString()}`,
      );
      return { status: 'DUPLICATE_IGNORED', eventId, reserved: true };
    }

    // 2. Transactional Stock Verification & Reservation
    const result = await prisma.$transaction(async (tx) => {
      // Validate all products and stock availability
      for (const item of payload.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product || !product.isActive) {
          throw new Error(
            `Product [${item.productId}] is unavailable or inactive for order ${payload.orderNumber}`,
          );
        }

        // Enforce non-negative inventory constraint
        if (product.stock < item.quantity) {
          throw new Error(
            `Insufficient stock for [${product.name}]. Requested ${item.quantity}, available ${product.stock}`,
          );
        }

        // Decrement stock
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });

        // Audit inventory movement
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            changeQuantity: -item.quantity,
            previousStock: product.stock,
            newStock: updated.stock,
            reason: 'ORDER_RESERVED',
            referenceId: payload.orderId,
          },
        });
      }

      // Record durable idempotency marker within the same ACID transaction
      await tx.processedEvent.create({
        data: {
          eventId,
          consumer: this.CONSUMER_NAME,
          eventType: envelope.eventType,
        },
      });

      return { success: true };
    });

    const durationMs = Date.now() - startTime;
    console.log(
      `[InventoryWorker] Reserved inventory for Order [${payload.orderNumber}] in ${durationMs}ms`,
    );

    // 3. Emit downstream events: inventory.reserved.v1 and notification.requested.v1
    const reservedEvent: EventEnvelope<InventoryReservedPayload> = {
      eventId: `evt-inv-res-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      eventType: EVENT_TYPES.INVENTORY_RESERVED_V1,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      producer: 'shopcloud-inventory-worker',
      correlationId,
      causationId: eventId,
      aggregateType: 'Inventory',
      aggregateId: payload.orderId,
      payload: {
        orderId: payload.orderId,
        items: payload.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        reservedAt: new Date().toISOString(),
        status: 'RESERVED',
      },
    };
    await WorkerEventPublisher.publish(reservedEvent);

    const notificationEvent: EventEnvelope<NotificationRequestedPayload> = {
      eventId: `evt-notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      eventType: EVENT_TYPES.NOTIFICATION_REQUESTED_V1,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      producer: 'shopcloud-inventory-worker',
      correlationId,
      causationId: eventId,
      aggregateType: 'Notification',
      aggregateId: payload.orderId,
      payload: {
        recipientEmail: payload.userEmail,
        recipientName: 'Valued Customer',
        template: 'ORDER_CONFIRMATION',
        variables: {
          orderNumber: payload.orderNumber,
          totalAmount: payload.totalAmount / 100,
        },
        orderId: payload.orderId,
        correlationId,
      },
    };
    await WorkerEventPublisher.publish(notificationEvent);

    return { status: 'SUCCESS', eventId, reserved: true };
  }

  /**
   * Handles release of reserved inventory (e.g., cancelled orders or payment failures).
   */
  static async handleInventoryReleased(
    envelope: EventEnvelope<InventoryReleasedPayload>,
  ): Promise<{ status: string; eventId: string }> {
    const { payload, eventId, correlationId } = envelope;

    console.log(
      `[InventoryWorker] Processing InventoryReleased for order [${payload.orderId}] (eventId: ${eventId})`,
    );

    const alreadyProcessed = await prisma.processedEvent.findUnique({
      where: {
        eventId_consumer: {
          eventId,
          consumer: this.CONSUMER_NAME,
        },
      },
    });

    if (alreadyProcessed) {
      console.log(
        `[InventoryWorker] [IDEMPOTENT_SKIP] Release event ${eventId} already processed.`,
      );
      return { status: 'DUPLICATE_IGNORED', eventId };
    }

    await prisma.$transaction(async (tx) => {
      for (const item of payload.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

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
              reason: 'ORDER_RELEASED',
              referenceId: payload.orderId,
            },
          });
        }
      }

      await tx.processedEvent.create({
        data: {
          eventId,
          consumer: this.CONSUMER_NAME,
          eventType: envelope.eventType,
        },
      });
    });

    console.log(
      `[InventoryWorker] Released inventory for order [${payload.orderId}] (correlationId: ${correlationId})`,
    );
    return { status: 'SUCCESS', eventId };
  }
}
