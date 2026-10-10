import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@shopcloud/database';
import {
  EVENT_TYPES,
  EventEnvelope,
  OrderCreatedPayload,
  NotificationRequestedPayload,
} from '@shopcloud/contracts';
import { normalizeEnvelope, handleEvent } from '../src/event-router';
import { InventoryWorker } from '../src/inventory-worker';
import { NotificationWorker } from '../src/notification-worker';

describe('Workers Unit & Idempotency Tests', () => {
  test('normalizeEnvelope handles standard EventEnvelope', () => {
    const envelope: EventEnvelope<any> = {
      eventId: 'evt-test-1',
      eventType: EVENT_TYPES.ORDER_CREATED_V1,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      producer: 'shopcloud-api',
      correlationId: 'corr-1',
      aggregateType: 'Order',
      aggregateId: 'ord-1',
      payload: { orderId: 'ord-1', orderNumber: 'ORD-1001' },
    };

    const normalized = normalizeEnvelope(envelope);
    assert.equal(normalized.eventId, 'evt-test-1');
    assert.equal(normalized.eventType, EVENT_TYPES.ORDER_CREATED_V1);
    assert.equal(normalized.correlationId, 'corr-1');
  });

  test('normalizeEnvelope converts CloudEventEnvelope', () => {
    const cloudEvent = {
      specversion: '1.0',
      type: EVENT_TYPES.NOTIFICATION_REQUESTED_V1,
      source: 'shopcloud-api',
      id: 'ce-test-2',
      time: '2026-10-08T12:00:00Z',
      datacontenttype: 'application/json',
      correlationid: 'corr-2',
      aggregatetype: 'Notification',
      aggregateid: 'notif-1',
      data: { recipientEmail: 'user@example.com' },
    };

    const normalized = normalizeEnvelope(cloudEvent);
    assert.equal(normalized.eventId, 'ce-test-2');
    assert.equal(normalized.eventType, EVENT_TYPES.NOTIFICATION_REQUESTED_V1);
    assert.equal(normalized.correlationId, 'corr-2');
    assert.equal(normalized.payload.recipientEmail, 'user@example.com');
  });

  test('normalizeEnvelope throws on malformed payload', () => {
    assert.throws(() => normalizeEnvelope(null), /Invalid event envelope structure/);
    assert.throws(() => normalizeEnvelope({}), /Invalid event envelope structure/);
  });
});
