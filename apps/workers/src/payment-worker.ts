import { prisma, PaymentStatus, OrderStatus } from '@shopcloud/database';

export class PaymentWorker {
  static async processPaymentWebhook(payload: {
    orderId: string;
    userId: string;
    amount: number;
    provider: string;
    transactionRef: string;
    idempotencyKey: string;
  }) {
    console.log(`[PaymentWorker] Processing payment webhook with idempotencyKey: ${payload.idempotencyKey}`);

    // 1. Idempotency Check: Don't process twice if duplicate webhook arrives
    const existingPayment = await prisma.payment.findUnique({
      where: { idempotencyKey: payload.idempotencyKey },
    });

    if (existingPayment) {
      console.warn(`[PaymentWorker] Duplicate payment webhook ignored for key: ${payload.idempotencyKey}`);
      return { status: 'DUPLICATE_IGNORED', paymentId: existingPayment.id };
    }

    // 2. Record Payment & update Order status in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          orderId: payload.orderId,
          userId: payload.userId,
          amount: payload.amount,
          currency: 'INR',
          status: PaymentStatus.SUCCESS,
          provider: payload.provider,
          transactionRef: payload.transactionRef,
          idempotencyKey: payload.idempotencyKey,
        },
      });

      await tx.order.update({
        where: { id: payload.orderId },
        data: {
          status: OrderStatus.CONFIRMED,
          paymentId: payment.id,
        },
      });

      return payment;
    });

    console.log(`[PaymentWorker] Successfully processed payment and confirmed Order: ${payload.orderId}`);
    return { status: 'CONFIRMED', paymentId: result.id };
  }
}
