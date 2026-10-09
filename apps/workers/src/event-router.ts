import {
  EventEnvelope,
  EVENT_TYPES,
  fromCloudEvent,
  CloudEventEnvelope,
} from '@shopcloud/contracts';
import { InventoryWorker } from './inventory-worker';
import { NotificationWorker } from './notification-worker';

/**
 * Normalizes input payload into a standardized EventEnvelope.
 */
export function normalizeEnvelope(input: any): EventEnvelope<any> {
  if (input && input.specversion === '1.0' && input.type && input.data) {
    return fromCloudEvent(input as CloudEventEnvelope<any>);
  }

  if (input && input.eventId && input.eventType && input.payload) {
    return input as EventEnvelope<any>;
  }

  // Fallback for legacy format { type, data, ... }
  if (input && input.type && input.data) {
    return {
      eventId: input.id || `evt-${Date.now()}`,
      eventType: input.type,
      eventVersion: 'v1',
      occurredAt: input.time || new Date().toISOString(),
      producer: input.source || 'shopcloud-producer',
      correlationId: input.correlationid || input.id || `corr-${Date.now()}`,
      aggregateType: input.aggregatetype || 'Unknown',
      aggregateId: input.aggregateid || input.data?.orderId || 'unknown',
      payload: input.data,
    };
  }

  throw new Error('Invalid event envelope structure');
}

/**
 * Routes one domain event to its respective worker handlers.
 * Shared by both pull (local emulator) and push (Cloud Run) delivery.
 * Throws on failure to cause Pub/Sub redelivery/NACK.
 */
export async function handleEvent(rawInput: any): Promise<void> {
  const envelope = normalizeEnvelope(rawInput);
  const { eventType, eventId, correlationId, aggregateId } = envelope;

  console.log(
    `[EventRouter] Routing event [${eventType}] (id: ${eventId}, agg: ${aggregateId}, corr: ${correlationId})`,
  );

  switch (eventType) {
    case EVENT_TYPES.ORDER_CREATED_V1:
    case 'shopcloud.order.created':
    case 'order.created': {
      await InventoryWorker.handleOrderCreated(envelope);
      break;
    }

    case EVENT_TYPES.INVENTORY_RELEASED_V1:
    case 'inventory.released': {
      await InventoryWorker.handleInventoryReleased(envelope);
      break;
    }

    case EVENT_TYPES.NOTIFICATION_REQUESTED_V1:
    case 'notification.requested': {
      await NotificationWorker.handleNotification(envelope);
      break;
    }

    case EVENT_TYPES.INVENTORY_RESERVED_V1:
    case 'inventory.reserved': {
      console.log(
        `[EventRouter] [OBSERVED] Inventory reserved event acknowledged: ${aggregateId}`,
      );
      break;
    }

    default:
      console.warn(
        `[EventRouter] Unhandled or informative event type [${eventType}]. Skipping dispatch.`,
      );
      break;
  }
}
