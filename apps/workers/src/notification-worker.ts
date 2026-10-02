import { prisma } from '@shopcloud/database';
import { NotificationRequestedEvent } from '@shopcloud/contracts';

export class NotificationWorker {
  static async handleNotification(event: NotificationRequestedEvent) {
    console.log(`[NotificationWorker] Sending ${event.template} to ${event.recipientEmail}`);

    const record = await prisma.notification.create({
      data: {
        recipientEmail: event.recipientEmail,
        recipientName: event.recipientName,
        template: event.template,
        variables: event.variables as any,
        orderId: event.orderId,
        status: 'SENT',
      },
    });

    console.log(`[NotificationWorker] Dispatched notification ID: ${record.id}`);
    return record;
  }
}
