import { prisma } from '@shopcloud/database';
import { OrderCreatedEvent } from '@shopcloud/contracts';

export class InventoryWorker {
  static async handleOrderCreated(event: OrderCreatedEvent) {
    console.log(`[InventoryWorker] Processing stock verification for Order: ${event.orderNumber}`);

    for (const item of event.items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (product) {
        console.log(`[InventoryWorker] Product [${product.name}] stock after order reservation: ${product.stock}`);
      }
    }
  }

  static async handlePaymentFailed(orderId: string) {
    console.log(`[InventoryWorker] Releasing reserved stock for failed payment on order: ${orderId}`);

    const movements = await prisma.inventoryMovement.findMany({
      where: { referenceId: orderId, reason: 'ORDER_RESERVED' },
    });

    for (const move of movements) {
      const releaseQuantity = Math.abs(move.changeQuantity);
      const updated = await prisma.product.update({
        where: { id: move.productId },
        data: { stock: { increment: releaseQuantity } },
      });

      await prisma.inventoryMovement.create({
        data: {
          productId: move.productId,
          changeQuantity: releaseQuantity,
          previousStock: updated.stock - releaseQuantity,
          newStock: updated.stock,
          reason: 'PAYMENT_FAILED_RELEASE',
          referenceId: orderId,
        },
      });

      console.log(`[InventoryWorker] Released ${releaseQuantity} units back to product ${move.productId}`);
    }
  }
}
