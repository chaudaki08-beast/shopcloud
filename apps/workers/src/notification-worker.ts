import { prisma } from '@shopcloud/database';
import { EventEnvelope, NotificationRequestedPayload } from '@shopcloud/contracts';

export class NotificationWorker {
  static readonly CONSUMER_NAME = 'notification-worker';

  static async handleNotification(
    envelope: EventEnvelope<NotificationRequestedPayload>,
  ): Promise<{ status: string; eventId: string; notificationId?: string }> {
    const startTime = Date.now();
    const { payload, eventId, correlationId } = envelope;

    console.log(
      `[NotificationWorker] Handling ${payload.template} for ${payload.recipientEmail} (eventId: ${eventId}, correlationId: ${correlationId})`,
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
        `[NotificationWorker] [IDEMPOTENT_SKIP] Event ${eventId} already processed by ${this.CONSUMER_NAME}.`,
      );
      return { status: 'DUPLICATE_IGNORED', eventId };
    }

    // 2. Transactional Notification Persistence & Idempotency Marker
    const record = await prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          recipientEmail: payload.recipientEmail,
          recipientName: payload.recipientName,
          template: payload.template,
          status: 'PROCESSED',
          variables: payload.variables as any,
          orderId: payload.orderId,
          correlationId: correlationId || payload.correlationId,
        },
      });

      await tx.processedEvent.create({
        data: {
          eventId,
          consumer: this.CONSUMER_NAME,
          eventType: envelope.eventType,
        },
      });

      return notification;
    });

    const durationMs = Date.now() - startTime;
    console.log(
      `[NotificationWorker] Dispatched notification ID [${record.id}] in ${durationMs}ms`,
    );

    return { status: 'SUCCESS', eventId, notificationId: record.id };
  }
}
