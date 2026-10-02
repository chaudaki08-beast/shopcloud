import { PubSub } from '@google-cloud/pubsub';
import { InventoryWorker } from './inventory-worker';
import { PaymentWorker } from './payment-worker';
import { NotificationWorker } from './notification-worker';
import { CloudEventEnvelope, OrderCreatedEvent } from '@shopcloud/contracts';

async function bootstrapWorkers() {
  console.log('⚡ Starting ShopCloud Event Workers Daemon...');

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
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrapWorkers();
