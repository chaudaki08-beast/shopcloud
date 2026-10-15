import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorkerLifecycle } from '../src/worker-lifecycle';
import { normalizeEnvelope } from '../src/event-router';

describe('Worker Resilience & Lifecycle Tests', () => {
  test('in-flight counter initializes at zero and worker is not shutting down', () => {
    WorkerLifecycle.resetForTesting();
    assert.equal(WorkerLifecycle.getInFlightCount(), 0);
    assert.equal(WorkerLifecycle.isShuttingDown(), false);

    WorkerLifecycle.incrementInFlight();
    assert.equal(WorkerLifecycle.getInFlightCount(), 1);

    WorkerLifecycle.decrementInFlight();
    assert.equal(WorkerLifecycle.getInFlightCount(), 0);

    WorkerLifecycle.setShuttingDown(true);
    assert.equal(WorkerLifecycle.isShuttingDown(), true);
    WorkerLifecycle.resetForTesting();
  });

  test('poison message handling: malformed structures throw predictable errors for non-2xx/drop decision', () => {
    // Completely invalid types
    assert.throws(() => normalizeEnvelope(null), /Invalid event envelope structure/);
    assert.throws(() => normalizeEnvelope('invalid-string'), /Invalid event envelope structure/);
    assert.throws(() => normalizeEnvelope({ unknown: true }), /Invalid event envelope structure/);

    // Empty object
    assert.throws(() => normalizeEnvelope({}), /Invalid event envelope structure/);
  });

  test('normalizes legacy event format with fallback defaults safely', () => {
    const legacy = {
      type: 'order.created',
      data: { orderId: 'ord-legacy-1', items: [] },
    };

    const normalized = normalizeEnvelope(legacy);
    assert.ok(normalized.eventId.startsWith('evt-'));
    assert.equal(normalized.eventType, 'order.created');
    assert.equal(normalized.aggregateId, 'ord-legacy-1');
    assert.ok(normalized.correlationId.startsWith('corr-'));
  });

  test('normalizes standard CloudEvent v1.0 schema preserving trace headers', () => {
    const cloudEvent = {
      specversion: '1.0',
      type: 'order.created.v1',
      source: 'shopcloud-api',
      id: 'ce-trace-123',
      time: '2026-10-15T10:00:00.000Z',
      datacontenttype: 'application/json',
      correlationid: 'corr-trace-abc',
      causationid: 'cause-trace-xyz',
      aggregatetype: 'Order',
      aggregateid: 'ord-456',
      data: { orderId: 'ord-456' },
    };

    const normalized = normalizeEnvelope(cloudEvent);
    assert.equal(normalized.eventId, 'ce-trace-123');
    assert.equal(normalized.correlationId, 'corr-trace-abc');
    assert.equal(normalized.causationId, 'cause-trace-xyz');
    assert.equal(normalized.aggregateType, 'Order');
    assert.equal(normalized.aggregateId, 'ord-456');
  });
});
