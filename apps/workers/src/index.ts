import * as http from 'http';
import { PubSub } from '@google-cloud/pubsub';
import { InventoryWorker } from './inventory-worker';
import { PaymentWorker } from './payment-worker';
import { NotificationWorker } from './notification-worker';
import { CloudEventEnvelope, OrderCreatedEvent } from '@shopcloud/contracts';

async function bootstrapWorkers() {
  console.log('⚡ Starting ShopCloud Event Workers Daemon...');

  // Start lightweight HTTP health probe server for Docker & Cloud Run liveness/readiness
  const healthPort = Number(process.env.HEALTH_PORT || process.env.PORT || 8081);
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/liveness' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'UP',
          service: 'shopcloud-workers',
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  healthServer.listen(healthPort, '0.0.0.0', () => {
    console.log(`[Worker] Health probe active on http://0.0.0.0:${healthPort}/health`);
  });

  const projectId = process.env.GCP_PROJECT_ID || 'shopcloud-dev';
  const emulatorHost = process.env.PUBSUB_EMULATOR_HOST;

  const pubsub = new PubSub({
    projectId,
    apiEndpoint: emulatorHost,
  });

  const subscriptionName = `${projectId}-inventory-sub`;
  try {
    const subscription = pubsub.subscription(subscriptionName);

    subscription.on('message', async (message) => {
      console.log(`[Worker] Received message ID: ${message.id}`);
      try {
        const payload: CloudEventEnvelope<any> = JSON.parse(message.data.toString());
        console.log(`[Worker] Event Type: ${payload.type}`);

        if (payload.type === 'shopcloud.order.created') {
          await InventoryWorker.handleOrderCreated(payload.data as OrderCreatedEvent);
          await NotificationWorker.handleNotification({
            recipientEmail: payload.data.userEmail,
            recipientName: 'Valued Customer',
            template: 'ORDER_CONFIRMATION',
            variables: {
              orderNumber: payload.data.orderNumber,
              totalAmount: payload.data.totalAmount / 100,
            },
            orderId: payload.data.orderId,
          });
        }

        message.ack();
      } catch (err) {
        console.error(`[Worker] Error processing message ${message.id}:`, err);
        message.nack();
      }
    });

    console.log(`[Worker] Listening for events on subscription: ${subscriptionName}`);
  } catch (err) {
    console.warn(`[Worker] Notice: Pub/Sub listener offline (${(err as Error).message}). Local dev mode active.`);
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log('Shutting down workers gracefully...');
    healthServer.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrapWorkers();
