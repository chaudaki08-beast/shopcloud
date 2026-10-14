import { prisma } from '@shopcloud/database';
import { EventEnvelope, NotificationRequestedPayload } from '@shopcloud/contracts';
import { WorkerLogger } from './worker-logger';

export class NotificationWorker {
  static readonly CONSUMER_NAME = 'notification-worker';

  static async handleNotification(
    envelope: EventEnvelope<NotificationRequestedPayload>,
  ): Promise<{ status: string; eventId: string; notificationId?: string }> {
    const startTime = Date.now();
    const { payload, eventId, correlationId } = envelope;

    WorkerLogger.info(
      `Handling notification template [${payload.template}] (eventId: ${eventId}, correlationId: ${correlationId})`,
      this.CONSUMER_NAME,
      { template: payload.template, eventId, correlationId },
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
      WorkerLogger.logEvent({
        consumerName: this.CONSUMER_NAME,
        eventType: envelope.eventType,
        eventId,
        correlationId,
        aggregateType: envelope.aggregateType,
        aggregateId: payload.orderId,
        outcome: 'DUPLICATE_IGNORED',
        durationMs: Date.now() - startTime,
      });
      return { status: 'DUPLICATE_IGNORED', eventId };
    }

    try {
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
      WorkerLogger.logEvent({
        consumerName: this.CONSUMER_NAME,
        eventType: envelope.eventType,
        eventId,
        correlationId,
        aggregateType: envelope.aggregateType,
        aggregateId: payload.orderId,
        outcome: 'SUCCESS',
        durationMs,
      });

      return { status: 'SUCCESS', eventId, notificationId: record.id };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      WorkerLogger.logEvent({
        consumerName: this.CONSUMER_NAME,
        eventType: envelope.eventType,
        eventId,
        correlationId,
        aggregateType: envelope.aggregateType,
        aggregateId: payload.orderId,
        outcome: 'FAILED',
        durationMs,
        error: (err as Error).message,
      });
      throw err;
    }
  }
}
