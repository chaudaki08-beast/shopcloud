import { PubSub, Topic } from '@google-cloud/pubsub';
import { EventEnvelope, PubSubTopic, toCloudEvent } from '@shopcloud/contracts';

export class WorkerEventPublisher {
  private static pubsub: PubSub | null = null;
  private static topics = new Map<string, Topic>();
  private static defaultTopic = process.env.PUBSUB_TOPIC_DOMAIN_EVENTS || PubSubTopic.DOMAIN_EVENTS;
  public static inMemoryEvents: EventEnvelope<any>[] = [];

  static setPubSub(client: PubSub) {
    this.pubsub = client;
  }

  private static getPubSub(): PubSub | null {
    if (this.pubsub) return this.pubsub;
    const isTest = process.env.NODE_ENV === 'test';
    if (isTest) return null;

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
      return this.pubsub;
    } catch {
      return null;
    }
  }

  static async publish<T>(
    envelope: EventEnvelope<T>,
    topicName: string = this.defaultTopic,
  ): Promise<string> {
    this.inMemoryEvents.push(envelope);

    const client = this.getPubSub();
    if (client) {
      try {
        let topic = this.topics.get(topicName);
        if (!topic) {
          topic = client.topic(topicName);
          this.topics.set(topicName, topic);
        }

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

        const messageId = await topic.publishMessage({
          data: dataBuffer,
          attributes,
          orderingKey: envelope.aggregateId,
        });

        console.log(
          `[WorkerPublisher] Published ${envelope.eventType} (${envelope.eventId}) to [${topicName}] -> messageId: ${messageId}`,
        );
        return messageId;
      } catch (err: any) {
        console.warn(
          `[WorkerPublisher] Pub/Sub publishing failed (${err.message}). Stored in memory.`,
        );
      }
    }

    return envelope.eventId;
  }
}
