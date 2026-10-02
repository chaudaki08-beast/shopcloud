import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PubSub } from '@google-cloud/pubsub';
import { PubSubTopic, CloudEventEnvelope } from '@shopcloud/contracts';

@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);
  private pubsub: PubSub | null = null;

  onModuleInit() {
    try {
      const projectId = process.env.GCP_PROJECT_ID || 'shopcloud-dev';
      this.pubsub = new PubSub({
        projectId,
        apiEndpoint: process.env.PUBSUB_EMULATOR_HOST,
      });
      this.logger.log(`Initialized GCP PubSub client for project [${projectId}]`);
    } catch (err) {
      this.logger.warn(`Could not initialize Google PubSub client: ${(err as Error).message}. Operating in dev-event mode.`);
    }
  }

  async publish<T>(topicName: PubSubTopic | string, data: T, eventType: string): Promise<string> {
    const envelope: CloudEventEnvelope<T> = {
      specversion: '1.0',
      type: eventType,
      source: 'shopcloud-api',
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      data,
    };

    const payloadBuffer = Buffer.from(JSON.stringify(envelope));

    if (this.pubsub) {
      try {
        const topic = this.pubsub.topic(topicName);
        const messageId = await topic.publishMessage({ data: payloadBuffer });
        this.logger.log(`Published event [${eventType}] to topic [${topicName}] with ID: ${messageId}`);
        return messageId;
      } catch (error) {
        this.logger.error(`Failed to publish event to Pub/Sub: ${(error as Error).message}. Falling back to simulated broadcast.`);
      }
    }

    // Local development fallback
    this.logger.log(`[LOCAL EVENT BUS] Broadcasted ${eventType} on ${topicName}: ${JSON.stringify(envelope.id)}`);
    return envelope.id;
  }
}
