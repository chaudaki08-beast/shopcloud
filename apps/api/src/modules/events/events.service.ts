import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PubSub, Topic } from '@google-cloud/pubsub';
import {
  EventEnvelope,
  EVENT_TYPES,
  PubSubTopic,
  toCloudEvent,
} from '@shopcloud/contracts';

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private pubsub: PubSub | null = null;
  private topics = new Map<string, Topic>();
  private defaultTopicName: string = PubSubTopic.DOMAIN_EVENTS;
  private readonly inMemoryStore: EventEnvelope<any>[] = [];
  private readonly listeners = new Map<string, Array<(event: EventEnvelope<any>) => Promise<void> | void>>();

  onModuleInit() {
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);
    this.defaultTopicName = process.env.PUBSUB_TOPIC_DOMAIN_EVENTS || PubSubTopic.DOMAIN_EVENTS;

    if (isTest) {
      this.logger.log('Running in test environment — Pub/Sub operating in in-memory mode.');
      return;
    }

    try {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        'project-c3f386b1-6c37-468d-8ee';
      const emulatorHost = process.env.PUBSUB_EMULATOR_HOST;

      this.pubsub = new PubSub({
        projectId,
        apiEndpoint: emulatorHost,
      });

      this.logger.log(
        `Initialized GCP Pub/Sub client for project [${projectId}] (default topic: ${this.defaultTopicName})${
          emulatorHost ? ` using emulator at ${emulatorHost}` : ''
        }`,
      );
    } catch (err) {
      this.logger.warn(
        `Could not initialize GCP Pub/Sub client: ${(err as Error).message}. Operating in in-memory event bus mode.`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.pubsub) {
      try {
        await this.pubsub.close();
      } catch (err) {
        this.logger.warn(`Error closing PubSub client: ${(err as Error).message}`);
      }
    }
  }

  get isPubSubActive(): boolean {
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);
    return Boolean(this.pubsub) && !isTest;
  }

  getTopic(topicName: string): Topic | null {
    if (!this.pubsub) return null;
    if (!this.topics.has(topicName)) {
      this.topics.set(topicName, this.pubsub.topic(topicName));
    }
    return this.topics.get(topicName)!;
  }

  /**
   * Publishes a standardized EventEnvelope to Google Cloud Pub/Sub
   * with message attributes and ordering keys for partition guarantees.
   */
  async publishEnvelope<T>(
    envelope: EventEnvelope<T>,
    topicName: string = this.defaultTopicName,
  ): Promise<string> {
    // Record in-memory for testing, local observability, and local listeners
    this.inMemoryStore.push(envelope);

    // Dispatch to registered local event listeners
    const handlers = this.listeners.get(envelope.eventType) || [];
    for (const handler of handlers) {
      try {
        await handler(envelope);
      } catch (err) {
        this.logger.error(
          `Local listener failed for event [${envelope.eventType}]: ${(err as Error).message}`,
        );
      }
    }

    if (this.isPubSubActive) {
      try {
        const topic = this.getTopic(topicName);
        if (topic) {
          const cloudEvent = toCloudEvent(envelope);
          const dataBuffer = Buffer.from(JSON.stringify(cloudEvent));

          const attributes: Record<string, string> = {
            eventId: envelope.eventId,
            eventType: envelope.eventType,
            eventVersion: envelope.eventVersion,
            correlationId: envelope.correlationId,
            aggregateType: envelope.aggregateType,
            aggregateId: envelope.aggregateId,
            producer: envelope.producer,
          };

          if (envelope.causationId) {
            attributes.causationId = envelope.causationId;
          }

          // Use aggregateId (e.g., orderId) as orderingKey to preserve sequential processing
          const messageId = await topic.publishMessage({
            data: dataBuffer,
            attributes,
            orderingKey: envelope.aggregateId,
          });

          this.logger.log(
            `[Pub/Sub] Published event ${envelope.eventType} (eventId: ${envelope.eventId}, aggregateId: ${envelope.aggregateId}) to topic [${topicName}] -> messageId: ${messageId}`,
          );

          return messageId;
        }
      } catch (error) {
        this.logger.error(
          `Failed to publish event ${envelope.eventId} to Pub/Sub: ${(error as Error).message}. Falling back to in-memory store.`,
        );
        throw error;
      }
    }

    this.logger.debug(
      `[In-Memory Event Bus] Handled event ${envelope.eventType} (eventId: ${envelope.eventId})`,
    );
    return envelope.eventId;
  }

  /** Backward-compatible publish helper */
  async publish<T>(
    topicName: PubSubTopic | string,
    data: T,
    eventType: string,
    correlationId: string = `corr-${Date.now()}`,
  ): Promise<string> {
    const envelope: EventEnvelope<T> = {
      eventId: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      eventType,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      producer: 'shopcloud-api',
      correlationId,
      aggregateType: 'Unknown',
      aggregateId: (data as any)?.orderId || (data as any)?.id || 'unknown',
      payload: data,
    };

    return this.publishEnvelope(envelope, topicName.toString());
  }

  /** Test helper: retrieve all published events */
  getPublishedEvents(): ReadonlyArray<EventEnvelope<any>> {
    return [...this.inMemoryStore];
  }

  /** Test helper: clear in-memory event store */
  clearPublishedEvents(): void {
    this.inMemoryStore.length = 0;
  }

  /** Register an in-process listener for testing / local event routing */
  registerListener(
    eventType: string,
    handler: (event: EventEnvelope<any>) => Promise<void> | void,
  ): () => void {
    const list = this.listeners.get(eventType) || [];
    list.push(handler);
    this.listeners.set(eventType, list);
    return () => {
      const current = this.listeners.get(eventType) || [];
      this.listeners.set(
        eventType,
        current.filter((h) => h !== handler),
      );
    };
  }
}
