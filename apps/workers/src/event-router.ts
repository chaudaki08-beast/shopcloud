import { CloudEventEnvelope } from '@shopcloud/contracts';
import { InventoryWorker } from './inventory-worker';
import { NotificationWorker } from './notification-worker';

/**
 * Routes one CloudEvent to its handlers. Shared by pull (local emulator) and push (Cloud Run) delivery.
 * Throws on failure so the caller can nack / return a retryable status.
 */
export async function handleEvent(payload: CloudEventEnvelope<any>): Promise<void> {
  console.log(`[Worker] Event Type: ${payload.type}`);

  if (payload.type === 'shopcloud.order.created') {
    await InventoryWorker.handleOrderCreated(payload.data);
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
}
