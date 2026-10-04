import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodePushEnvelope,
  resolveDeliveryMode,
  resolveHttpPort,
  resolvePushAuth,
} from '../src/runtime-config';

test('Cloud Run PORT wins over HEALTH_PORT', () => {
  assert.equal(resolveHttpPort({ PORT: '8080', HEALTH_PORT: '8081' }), 8080);
});

test('HEALTH_PORT is used locally when PORT is absent', () => {
  assert.equal(resolveHttpPort({ HEALTH_PORT: '8081' }), 8081);
  assert.equal(resolveHttpPort({}), 8081);
});

test('delivery mode defaults to pull and rejects unknown values', () => {
  assert.equal(resolveDeliveryMode({}), 'pull');
  assert.equal(resolveDeliveryMode({ PUBSUB_DELIVERY: 'PUSH' }), 'push');
  assert.throws(() => resolveDeliveryMode({ PUBSUB_DELIVERY: 'stream' }), /must be "pull" or "push"/);
});

test('push OIDC verification is mandatory in production', () => {
  assert.throws(() => resolvePushAuth({ NODE_ENV: 'production' }), /required for push delivery/);
  assert.deepEqual(
    resolvePushAuth({
      NODE_ENV: 'production',
      PUBSUB_PUSH_AUDIENCE: 'https://worker.example.run.app/pubsub/push',
      PUBSUB_PUSH_SERVICE_ACCOUNT: 'pubsub-push@example.iam.gserviceaccount.com',
    }),
    {
      audience: 'https://worker.example.run.app/pubsub/push',
      serviceAccountEmail: 'pubsub-push@example.iam.gserviceaccount.com',
    },
  );
  assert.equal(resolvePushAuth({ NODE_ENV: 'development' }), null);
});

test('decodes a Pub/Sub push envelope', () => {
  const event = { specversion: '1.0', type: 'shopcloud.order.created', data: { orderId: 'ord-1' } };
  const body = {
    message: { data: Buffer.from(JSON.stringify(event)).toString('base64'), messageId: '42' },
    subscription: 'projects/p/subscriptions/s',
  };
  const decoded = decodePushEnvelope(body);
  assert.equal(decoded.messageId, '42');
  assert.equal(decoded.event.type, 'shopcloud.order.created');
  assert.equal(decoded.event.data.orderId, 'ord-1');
});

test('rejects a malformed push envelope', () => {
  assert.throws(() => decodePushEnvelope({}), /message.data missing/);
  assert.throws(() => decodePushEnvelope({ message: { data: 42 } }), /message.data missing/);
});
