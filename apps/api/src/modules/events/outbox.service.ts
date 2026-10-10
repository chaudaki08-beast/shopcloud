import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { prisma, OutboxEvent, Prisma } from '@shopcloud/database';
import { EventEnvelope } from '@shopcloud/contracts';
import { EventsService } from './events.service';
import { useDatabase } from '../../db-status';

const MAX_PUBLISH_ATTEMPTS = 5;
const BASE_RETRY_BACKOFF_MS = 1000;
const MAX_RETRY_BACKOFF_MS = 60000;
const POLLING_INTERVAL_MS = 5000;

@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private pollingTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(private readonly eventsService: EventsService) {}

  onModuleInit() {
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);
    if (!isTest) {
      // Start background polling loop for pending outbox events
      this.pollingTimer = setInterval(() => {
        void this.processPendingOutbox();
      }, POLLING_INTERVAL_MS);
      this.pollingTimer.unref();
      this.logger.log('Outbox background publisher worker initialized.');
    }
  }

  onModuleDestroy() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Persists an event envelope within an existing Prisma transaction.
   * This guarantees transactional atomicity between business state mutations and event publication.
   */
  async recordEvent<T>(
    tx: Prisma.TransactionClient,
    envelope: EventEnvelope<T>,
  ): Promise<OutboxEvent> {
    const record = await tx.outboxEvent.create({
      data: {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        eventVersion: envelope.eventVersion,
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
        payload: envelope.payload as any,
        correlationId: envelope.correlationId,
        causationId: envelope.causationId,
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
      },
    });

    this.logger.debug(
      `[Outbox] Recorded event ${envelope.eventType} (${envelope.eventId}) for aggregate ${envelope.aggregateId}`,
    );

    return record;
  }

  /**
   * Attempts immediate dispatch for an outbox event.
   * Safe against concurrency races: atomically transitions status from PENDING to PROCESSING.
   */
  async dispatchImmediate(eventId: string): Promise<boolean> {
    if (!(await useDatabase())) return false;

    // Atomically claim the pending event to prevent concurrent dual-publishing
    const updateCount = await prisma.outboxEvent.updateMany({
      where: {
        eventId,
        status: 'PENDING',
      },
      data: {
        status: 'PROCESSING',
      },
    });

    if (updateCount.count === 0) {
      // Already claimed, published, or does not exist
      return false;
    }

    const eventRecord = await prisma.outboxEvent.findUnique({
      where: { eventId },
    });

    if (!eventRecord) return false;

    const envelope: EventEnvelope<any> = {
      eventId: eventRecord.eventId,
      eventType: eventRecord.eventType,
      eventVersion: eventRecord.eventVersion,
      occurredAt: eventRecord.createdAt.toISOString(),
      producer: 'shopcloud-api',
      correlationId: eventRecord.correlationId || eventRecord.eventId,
      causationId: eventRecord.causationId || undefined,
      aggregateType: eventRecord.aggregateType,
      aggregateId: eventRecord.aggregateId,
      payload: eventRecord.payload,
    };

    try {
      await this.eventsService.publishEnvelope(envelope);

      await prisma.outboxEvent.update({
        where: { id: eventRecord.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          lastError: null,
        },
      });

      this.logger.log(
        `[Outbox] Successfully dispatched event ${eventRecord.eventType} (${eventRecord.eventId})`,
      );
      return true;
    } catch (err: any) {
      const attempts = eventRecord.attempts + 1;
      const errorMessage = err?.message || 'Unknown publication failure';

      if (attempts >= MAX_PUBLISH_ATTEMPTS) {
        this.logger.error(
          `[Outbox] Event ${eventRecord.eventId} exceeded max attempts (${attempts}/${MAX_PUBLISH_ATTEMPTS}). Marking as FAILED. Error: ${errorMessage}`,
        );
        await prisma.outboxEvent.update({
          where: { id: eventRecord.id },
          data: {
            status: 'FAILED',
            attempts,
            lastError: errorMessage,
          },
        });
      } else {
        const backoffMs = Math.min(
          MAX_RETRY_BACKOFF_MS,
          BASE_RETRY_BACKOFF_MS * Math.pow(2, attempts),
        );
        const nextAvailableAt = new Date(Date.now() + backoffMs);

        this.logger.warn(
          `[Outbox] Publication failed for event ${eventRecord.eventId} (attempt ${attempts}/${MAX_PUBLISH_ATTEMPTS}). Retrying in ${backoffMs}ms. Error: ${errorMessage}`,
        );

        await prisma.outboxEvent.update({
          where: { id: eventRecord.id },
          data: {
            status: 'PENDING',
            attempts,
            availableAt: nextAvailableAt,
            lastError: errorMessage,
          },
        });
      }

      return false;
    }
  }

  /**
   * Sweeps pending outbox events and publishes them sequentially or concurrently.
   */
  async processPendingOutbox(batchSize = 20): Promise<number> {
    if (this.isProcessing) return 0;
    if (!(await useDatabase())) return 0;

    this.isProcessing = true;
    let publishedCount = 0;

    try {
      const pendingEvents = await prisma.outboxEvent.findMany({
        where: {
          status: 'PENDING',
          availableAt: {
            lte: new Date(),
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: batchSize,
      });

      for (const event of pendingEvents) {
        const success = await this.dispatchImmediate(event.eventId);
        if (success) publishedCount++;
      }
    } catch (err) {
      this.logger.error(
        `[Outbox] Error during outbox sweep: ${(err as Error).message}`,
      );
    } finally {
      this.isProcessing = false;
    }

    return publishedCount;
  }
}
