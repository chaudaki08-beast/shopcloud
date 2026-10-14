import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkerLogger } from '../src/worker-logger';

test('WorkerLogger formats event lifecycle logs correctly', () => {
  let captured = '';
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: any) => {
    captured += chunk.toString();
    return true;
  }) as any;

  try {
    WorkerLogger.logEvent({
      consumerName: 'inventory-worker',
      eventType: 'order.created.v1',
      eventId: 'evt-test-123',
      correlationId: 'corr-test-456',
      aggregateType: 'Order',
      aggregateId: 'ord-789',
      outcome: 'SUCCESS',
      durationMs: 42,
    });

    assert.ok(captured.includes('inventory-worker'), 'Should include consumer name');
    assert.ok(captured.includes('order.created.v1'), 'Should include event type');
    assert.ok(captured.includes('evt-test-123'), 'Should include event id');
    assert.ok(captured.includes('corr-test-456'), 'Should include correlation id');
    assert.ok(captured.includes('SUCCESS'), 'Should include SUCCESS outcome');
    assert.ok(captured.includes('42ms'), 'Should include duration');
  } finally {
    process.stdout.write = originalWrite;
  }
});

test('WorkerLogger routes errors to stderr with redacted stack trace', () => {
  let capturedErr = '';
  const originalErrWrite = process.stderr.write;
  process.stderr.write = ((chunk: any) => {
    capturedErr += chunk.toString();
    return true;
  }) as any;

  try {
    const error = new Error('Database connection failed: postgresql://shopcloud:secret_password@127.0.0.1:5432/shopcloud');
    WorkerLogger.error('Worker failed to process event', error, 'TestWorker');

    assert.ok(capturedErr.includes('Worker failed to process event'));
    assert.ok(!capturedErr.includes('secret_password'), 'Must not contain plaintext password');
    assert.ok(capturedErr.includes('[REDACTED]'), 'Must contain [REDACTED]');
  } finally {
    process.stderr.write = originalErrWrite;
  }
});
