import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { prisma, PaymentStatus as PrismaPaymentStatus, OrderStatus as PrismaOrderStatus } from '@shopcloud/database';
import {
  PaymentStatus,
  OrderStatus,
  UserRole,
  EVENT_TYPES,
  EventEnvelope,
  PaymentInitiatedPayload,
  PaymentSucceededPayload,
  PaymentFailedPayload,
  PaymentRefundedPayload,
  InitiatePaymentDto,
  InitiatePaymentResponseDto,
  PaymentResponseDto,
  RefundPaymentDto,
  RefundPaymentResponseDto,
  WebhookResultDto,
} from '@shopcloud/contracts';
import { OutboxService } from '../events/outbox.service';
import { PaymentProvider } from './providers/payment-provider.interface';
import { TestPaymentAdapter } from './providers/test-payment.adapter';
import { RazorpayPaymentAdapter } from './providers/razorpay.adapter';
import { StripePaymentAdapter } from './providers/stripe.adapter';
import { OrderStateMachine } from '../orders/order-state-machine';

// Runtime environment detection helper
async function useDatabase(): Promise<boolean> {
  if (process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL) {
    return false;
  }
  return true;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers = new Map<string, PaymentProvider>();

  // In-memory fallback stores for test isolation without database
  private localPayments: any[] = [];
  private localPaymentEvents: any[] = [];
  private localProcessedEvents = new Set<string>();

  constructor(
    private readonly outboxService: OutboxService,
    private readonly testAdapter: TestPaymentAdapter,
    private readonly razorpayAdapter: RazorpayPaymentAdapter,
    private readonly stripeAdapter: StripePaymentAdapter,
  ) {
    this.registerProvider(this.testAdapter);
    this.registerProvider(this.razorpayAdapter);
    this.registerProvider(this.stripeAdapter);
  }

  private registerProvider(provider: PaymentProvider) {
    this.providers.set(provider.providerName, provider);
  }

  getProvider(name: string): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new BadRequestException(`Unsupported payment provider: ${name}`);
    }
    return provider;
  }

  /**
   * Initiates payment for an order.
   * Guarantees server-derived amounts, order ownership, and duplicate payment prevention.
   */
  async initiatePayment(
    userId: string,
    dto: InitiatePaymentDto,
    requestingUser?: { id: string; role?: string },
  ): Promise<InitiatePaymentResponseDto> {
    const providerName = dto.provider || 'TEST_SANDBOX';
    const provider = this.getProvider(providerName);
    const idempotencyKey = dto.idempotencyKey || `idem_pay_${dto.orderId}_${Date.now()}`;

    let order: any = null;

    if (await useDatabase()) {
      order = await prisma.order.findUnique({
        where: { id: dto.orderId },
        include: { user: true, payments: true },
      });
    }

    if (!order) {
      throw new NotFoundException(`Order '${dto.orderId}' not found`);
    }

    // 1. Authorization: check order ownership
    if (requestingUser) {
      const isAdmin =
        requestingUser.role === UserRole.SUPER_ADMIN ||
        requestingUser.role === UserRole.STORE_ADMIN;
      if (!isAdmin && order.userId !== userId) {
        throw new ForbiddenException('Cannot initiate payment for another customer order');
      }
    }

    // 2. State Invariant: order must be in PAYMENT_PENDING or CHECKOUT
    if (order.status === PrismaOrderStatus.CONFIRMED || order.status === PrismaOrderStatus.PAYMENT_SUCCESS) {
      throw new ConflictException({
        code: 'ORDER_ALREADY_PAID',
        message: `Order #${order.orderNumber} is already confirmed and paid`,
      });
    }

    if (order.status === PrismaOrderStatus.CANCELLED || order.status === PrismaOrderStatus.REFUNDED) {
      throw new ConflictException({
        code: 'ORDER_NOT_PAYABLE',
        message: `Order #${order.orderNumber} is cancelled and cannot be paid`,
      });
    }

    // 3. Prevent duplicate active payments
    const existingSuccessfulPayment = order.payments?.find(
      (p: any) => p.status === PrismaPaymentStatus.SUCCESS,
    );
    if (existingSuccessfulPayment) {
      throw new ConflictException({
        code: 'PAYMENT_ALREADY_SUCCEEDED',
        message: 'A successful payment already exists for this order',
      });
    }

    // Idempotency check: if existing pending payment has same idempotencyKey, return it
    const existingPending = order.payments?.find(
      (p: any) => p.idempotencyKey === idempotencyKey && p.status === PrismaPaymentStatus.PENDING,
    );
    if (existingPending) {
      return {
        paymentId: existingPending.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: existingPending.amount,
        currency: existingPending.currency,
        status: PaymentStatus.PENDING,
        provider: existingPending.provider,
        transactionRef: existingPending.transactionRef || undefined,
        createdAt: existingPending.createdAt.toISOString(),
      };
    }

    // 4. Server-Authoritative Amount Calculation (Integer Paise)
    const authoritativeAmount = order.grandTotal;
    if (authoritativeAmount <= 0) {
      throw new BadRequestException('Order amount must be greater than zero');
    }

    // 5. Invoke Provider Adapter Session Creation
    const session = await provider.createSession({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: authoritativeAmount,
      currency: order.currency,
      customerEmail: order.user?.email || 'customer@shopcloud.dev',
      customerName: `${order.user?.firstName || ''} ${order.user?.lastName || ''}`.trim(),
      idempotencyKey,
      returnUrl: dto.returnUrl,
    });

    // 6. Transactionally record Payment, PaymentEvent, and OutboxEvent
    let paymentRecord: any;
    const eventId = `evt-pay-init-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const correlationId = `corr-${order.id}`;

    const paymentInitiatedPayload: PaymentInitiatedPayload = {
      paymentId: '', // assigned in tx
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      amount: authoritativeAmount,
      currency: order.currency,
      provider: providerName,
      idempotencyKey,
      initiatedAt: new Date().toISOString(),
    };

    if (await useDatabase()) {
      paymentRecord = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            userId: order.userId,
            amount: authoritativeAmount,
            currency: order.currency,
            status: PrismaPaymentStatus.PENDING,
            provider: providerName,
            transactionRef: session.providerRef,
            idempotencyKey,
            payload: session.gatewayData as any,
          },
        });

        await tx.paymentEvent.create({
          data: {
            paymentId: payment.id,
            eventType: 'PAYMENT_INITIATED',
            status: PrismaPaymentStatus.PENDING,
            providerRef: session.providerRef,
            payload: session.gatewayData as any,
          },
        });

        paymentInitiatedPayload.paymentId = payment.id;

        await this.outboxService.recordEvent(tx, {
          eventId,
          eventType: EVENT_TYPES.PAYMENT_INITIATED_V1,
          eventVersion: 'v1',
          occurredAt: paymentInitiatedPayload.initiatedAt,
          producer: 'shopcloud-api',
          correlationId,
          aggregateType: 'Payment',
          aggregateId: payment.id,
          payload: paymentInitiatedPayload,
        });

        return payment;
      });

      // Dispatch outbox asynchronously (non-blocking)
      void this.outboxService.dispatchImmediate(eventId);
    } else {
      paymentRecord = {
        id: `pay-${Date.now()}`,
        orderId: order.id,
        userId: order.userId,
        amount: authoritativeAmount,
        currency: order.currency,
        status: PrismaPaymentStatus.PENDING,
        provider: providerName,
        transactionRef: session.providerRef,
        idempotencyKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.localPayments.push(paymentRecord);
    }

    this.logger.log(
      `Payment initiated: [${paymentRecord.id}] for Order [${order.orderNumber}] (Amount: ₹${authoritativeAmount / 100})`,
    );

    return {
      paymentId: paymentRecord.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: authoritativeAmount,
      currency: order.currency,
      status: PaymentStatus.PENDING,
      provider: providerName,
      transactionRef: session.providerRef,
      checkoutUrl: session.checkoutUrl,
      clientSecret: session.clientSecret,
      gatewayData: session.gatewayData,
      createdAt: paymentRecord.createdAt.toISOString ? paymentRecord.createdAt.toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Processes inbound webhook from a payment provider with strict cryptographic verification.
   */
  async handleWebhook(
    providerName: string,
    headers: Record<string, string>,
    rawBody: string | Buffer,
  ): Promise<WebhookResultDto> {
    const provider = this.getProvider(providerName);

    // 1. Cryptographic Signature Verification
    const verification = await provider.verifyWebhook(headers, rawBody);
    if (!verification.isValid) {
      this.logger.warn(`Rejected invalid webhook signature from provider: ${providerName}. Reason: ${verification.reason}`);
      throw new UnauthorizedException({
        code: 'INVALID_WEBHOOK_SIGNATURE',
        message: verification.reason || 'Cryptographic signature verification failed',
      });
    }

    const { providerEventId, providerRef, event } = verification;
    const consumerName = `payment-webhook-${providerName.toLowerCase()}`;

    // 2. Durable Idempotency Check
    if (await useDatabase()) {
      const alreadyProcessed = await prisma.processedEvent.findUnique({
        where: {
          eventId_consumer: {
            eventId: providerEventId,
            consumer: consumerName,
          },
        },
      });

      if (alreadyProcessed) {
        this.logger.log(`[IDEMPOTENT_SKIP] Duplicate webhook [${providerEventId}] already processed.`);
        return {
          success: true,
          event,
          providerEventId,
          message: 'DUPLICATE_IGNORED',
        };
      }
    } else {
      if (this.localProcessedEvents.has(`${providerEventId}:${consumerName}`)) {
        return { success: true, event, providerEventId, message: 'DUPLICATE_IGNORED' };
      }
    }

    // 3. Locate Target Payment Record
    let payment: any = null;
    if (await useDatabase()) {
      if (providerRef) {
        payment = await prisma.payment.findFirst({
          where: { transactionRef: providerRef },
          include: { order: { include: { items: true } } },
        });
      }
      if (!payment && verification.orderId) {
        payment = await prisma.payment.findFirst({
          where: { orderId: verification.orderId },
          orderBy: { createdAt: 'desc' },
          include: { order: { include: { items: true } } },
        });
      }
    } else {
      payment = this.localPayments.find(
        (p) => p.transactionRef === providerRef || p.orderId === verification.orderId,
      );
    }

    if (!payment) {
      this.logger.warn(`Webhook received for unknown payment/order reference: ${providerRef}`);
      return {
        success: false,
        event,
        providerEventId,
        message: 'PAYMENT_REFERENCE_NOT_FOUND',
      };
    }

    const order = payment.order;
    const correlationId = `corr-${order?.id || payment.orderId}`;

    // 4. State Transitions & Compensation Logic
    if (event === 'PAYMENT_SUCCESS') {
      if (payment.status === PrismaPaymentStatus.SUCCESS) {
        return { success: true, event, providerEventId, message: 'ALREADY_SUCCESS' };
      }

      if (await useDatabase()) {
        const createdEventId = await prisma.$transaction(async (tx) => {
          // Update Payment status
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: PrismaPaymentStatus.SUCCESS },
          });

          // Record PaymentEvent
          await tx.paymentEvent.create({
            data: {
              paymentId: payment.id,
              eventType: 'PAYMENT_CAPTURED',
              status: PrismaPaymentStatus.SUCCESS,
              providerRef,
              payload: verification.rawPayload as any,
            },
          });

          // Transition Order: PAYMENT_PENDING -> CONFIRMED
          if (order && order.status !== PrismaOrderStatus.CONFIRMED) {
            OrderStateMachine.validateTransition(
              order.status as unknown as OrderStatus,
              OrderStatus.CONFIRMED,
            );

            await tx.order.update({
              where: { id: order.id },
              data: {
                status: PrismaOrderStatus.CONFIRMED,
                paymentId: payment.id,
              },
            });

            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                fromStatus: order.status,
                toStatus: PrismaOrderStatus.CONFIRMED,
                reason: 'PAYMENT_CONFIRMED_WEBHOOK',
              },
            });
          }

          // Record ProcessedEvent marker
          await tx.processedEvent.create({
            data: {
              eventId: providerEventId,
              consumer: consumerName,
              eventType: event,
            },
          });

          // Record OutboxEvent: payment.succeeded.v1
          const eventId = `evt-pay-succ-${Date.now()}`;
          const payload: PaymentSucceededPayload = {
            paymentId: payment.id,
            orderId: payment.orderId,
            orderNumber: order?.orderNumber || 'ORD',
            userId: payment.userId,
            amount: payment.amount,
            currency: payment.currency,
            provider: providerName,
            transactionRef: providerRef,
            succeededAt: new Date().toISOString(),
          };

          await this.outboxService.recordEvent(tx, {
            eventId,
            eventType: EVENT_TYPES.PAYMENT_SUCCEEDED_V1,
            eventVersion: 'v1',
            occurredAt: payload.succeededAt,
            producer: 'shopcloud-api',
            correlationId,
            aggregateType: 'Payment',
            aggregateId: payment.id,
            payload,
          });

          return eventId;
        });

        void this.outboxService.dispatchImmediate(createdEventId);
      } else {
        payment.status = PrismaPaymentStatus.SUCCESS;
        this.localProcessedEvents.add(`${providerEventId}:${consumerName}`);
      }

      this.logger.log(`Payment [${payment.id}] confirmed via webhook.`);
      return { success: true, event, providerEventId };
    }

    if (event === 'PAYMENT_FAILED') {
      if (await useDatabase()) {
        const createdEventId = await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: PrismaPaymentStatus.FAILED },
          });

          await tx.paymentEvent.create({
            data: {
              paymentId: payment.id,
              eventType: 'PAYMENT_FAILED',
              status: PrismaPaymentStatus.FAILED,
              providerRef,
              payload: verification.rawPayload as any,
            },
          });

          // Compensation: Cancel order and release reserved stock
          if (order && order.status !== PrismaOrderStatus.CANCELLED) {
            await tx.order.update({
              where: { id: order.id },
              data: { status: PrismaOrderStatus.CANCELLED },
            });

            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                fromStatus: order.status,
                toStatus: PrismaOrderStatus.CANCELLED,
                reason: 'PAYMENT_FAILED_WEBHOOK',
              },
            });

            // Restore product inventory
            for (const item of order.items || []) {
              const product = await tx.product.findUnique({ where: { id: item.productId } });
              if (product) {
                const updated = await tx.product.update({
                  where: { id: item.productId },
                  data: { stock: { increment: item.quantity } },
                });

                await tx.inventoryMovement.create({
                  data: {
                    productId: item.productId,
                    changeQuantity: item.quantity,
                    previousStock: product.stock,
                    newStock: updated.stock,
                    reason: 'ORDER_PAYMENT_FAILED_RELEASE',
                    referenceId: order.id,
                  },
                });
              }
            }
          }

          // Record ProcessedEvent marker
          await tx.processedEvent.create({
            data: {
              eventId: providerEventId,
              consumer: consumerName,
              eventType: event,
            },
          });

          // Record OutboxEvent: payment.failed.v1
          const eventId = `evt-pay-fail-${Date.now()}`;
          const payload: PaymentFailedPayload = {
            paymentId: payment.id,
            orderId: payment.orderId,
            orderNumber: order?.orderNumber || 'ORD',
            userId: payment.userId,
            amount: payment.amount,
            currency: payment.currency,
            provider: providerName,
            reason: verification.reason || 'PAYMENT_FAILED',
            failedAt: new Date().toISOString(),
          };

          await this.outboxService.recordEvent(tx, {
            eventId,
            eventType: EVENT_TYPES.PAYMENT_FAILED_V1,
            eventVersion: 'v1',
            occurredAt: payload.failedAt,
            producer: 'shopcloud-api',
            correlationId,
            aggregateType: 'Payment',
            aggregateId: payment.id,
            payload,
          });

          return eventId;
        });

        void this.outboxService.dispatchImmediate(createdEventId);
      } else {
        payment.status = PrismaPaymentStatus.FAILED;
        this.localProcessedEvents.add(`${providerEventId}:${consumerName}`);
      }

      this.logger.warn(`Payment [${payment.id}] marked FAILED. Inventory compensated and restored.`);
      return { success: true, event, providerEventId };
    }

    if (event === 'REFUND_SUCCESS') {
      if (await useDatabase()) {
        const createdEventId = await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: PrismaPaymentStatus.REFUNDED },
          });

          await tx.paymentEvent.create({
            data: {
              paymentId: payment.id,
              eventType: 'REFUND_ISSUED',
              status: PrismaPaymentStatus.REFUNDED,
              providerRef,
              payload: verification.rawPayload as any,
            },
          });

          if (order && order.status !== PrismaOrderStatus.REFUNDED) {
            await tx.order.update({
              where: { id: order.id },
              data: { status: PrismaOrderStatus.REFUNDED },
            });
          }

          await tx.processedEvent.create({
            data: {
              eventId: providerEventId,
              consumer: consumerName,
              eventType: event,
            },
          });

          const eventId = `evt-pay-rfnd-${Date.now()}`;
          const payload: PaymentRefundedPayload = {
            paymentId: payment.id,
            orderId: payment.orderId,
            orderNumber: order?.orderNumber || 'ORD',
            userId: payment.userId,
            refundAmount: verification.amount || payment.amount,
            currency: payment.currency,
            provider: providerName,
            refundRef: providerRef,
            reason: 'WEBHOOK_REFUND',
            refundedAt: new Date().toISOString(),
          };

          await this.outboxService.recordEvent(tx, {
            eventId,
            eventType: EVENT_TYPES.PAYMENT_REFUNDED_V1,
            eventVersion: 'v1',
            occurredAt: payload.refundedAt,
            producer: 'shopcloud-api',
            correlationId,
            aggregateType: 'Payment',
            aggregateId: payment.id,
            payload,
          });

          return eventId;
        });

        void this.outboxService.dispatchImmediate(createdEventId);
      }

      return { success: true, event, providerEventId };
    }

    return { success: true, event: 'IGNORED', providerEventId };
  }

  /**
   * Processes refund for a completed payment.
   */
  async refundPayment(
    paymentId: string,
    dto: RefundPaymentDto,
    requestingUser?: { id: string; role?: string },
  ): Promise<RefundPaymentResponseDto> {
    let payment: any = null;

    if (await useDatabase()) {
      payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { order: { include: { items: true } } },
      });
    } else {
      payment = this.localPayments.find((p) => p.id === paymentId);
    }

    if (!payment) {
      throw new NotFoundException(`Payment '${paymentId}' not found`);
    }

    // Role check: Only admins or customer service can initiate refunds
    if (requestingUser) {
      const isPrivileged =
        requestingUser.role === UserRole.SUPER_ADMIN ||
        requestingUser.role === UserRole.STORE_ADMIN ||
        requestingUser.role === UserRole.CUSTOMER_SUPPORT;
      if (!isPrivileged) {
        throw new ForbiddenException('Insufficient permissions to issue refunds');
      }
    }

    if (payment.status !== PrismaPaymentStatus.SUCCESS) {
      throw new ConflictException({
        code: 'PAYMENT_NOT_REFUNDABLE',
        message: `Cannot refund payment in status ${payment.status}. Payment must be SUCCESS.`,
      });
    }

    const refundAmount = dto.amount || payment.amount;
    if (refundAmount > payment.amount || refundAmount <= 0) {
      throw new BadRequestException('Refund amount exceeds authorized payment total');
    }

    const provider = this.getProvider(payment.provider);
    const refundResult = await provider.refund({
      paymentRef: payment.transactionRef || payment.id,
      amount: refundAmount,
      reason: dto.reason,
      idempotencyKey: dto.idempotencyKey || `idem_rfnd_${payment.id}_${Date.now()}`,
    });

    const correlationId = `corr-${payment.orderId}`;
    const eventId = `evt-rfnd-${Date.now()}`;

    if (await useDatabase()) {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PrismaPaymentStatus.REFUNDED },
        });

        await tx.paymentEvent.create({
          data: {
            paymentId: payment.id,
            eventType: 'REFUND_ISSUED',
            status: PrismaPaymentStatus.REFUNDED,
            providerRef: refundResult.refundRef,
            payload: { refundAmount, reason: dto.reason },
          },
        });

        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: PrismaOrderStatus.REFUNDED },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: payment.orderId,
            fromStatus: payment.order?.status || PrismaOrderStatus.CONFIRMED,
            toStatus: PrismaOrderStatus.REFUNDED,
            reason: dto.reason || 'ADMIN_ISSUED_REFUND',
          },
        });

        // Release inventory back to stock if not already released
        if (payment.order && payment.order.status !== PrismaOrderStatus.CANCELLED) {
          for (const item of payment.order.items || []) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (product) {
              const updated = await tx.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
              });

              await tx.inventoryMovement.create({
                data: {
                  productId: item.productId,
                  changeQuantity: item.quantity,
                  previousStock: product.stock,
                  newStock: updated.stock,
                  reason: 'ORDER_REFUND_RELEASE',
                  referenceId: payment.orderId,
                },
              });
            }
          }
        }

        const payload: PaymentRefundedPayload = {
          paymentId: payment.id,
          orderId: payment.orderId,
          orderNumber: payment.order?.orderNumber || 'ORD',
          userId: payment.userId,
          refundAmount,
          currency: payment.currency,
          provider: payment.provider,
          refundRef: refundResult.refundRef,
          reason: dto.reason,
          refundedAt: new Date().toISOString(),
        };

          await this.outboxService.recordEvent(tx, {
            eventId,
            eventType: EVENT_TYPES.PAYMENT_REFUNDED_V1,
            eventVersion: 'v1',
            occurredAt: payload.refundedAt,
            producer: 'shopcloud-api',
            correlationId,
            aggregateType: 'Payment',
            aggregateId: payment.id,
            payload,
          });
        });

        void this.outboxService.dispatchImmediate(eventId);
    } else {
      payment.status = PrismaPaymentStatus.REFUNDED;
    }

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      refundRef: refundResult.refundRef,
      status: PaymentStatus.REFUNDED,
      refundAmount,
      currency: payment.currency,
      refundedAt: new Date().toISOString(),
    };
  }

  async getPaymentById(
    paymentId: string,
    requestingUser?: { id: string; role?: string },
  ): Promise<PaymentResponseDto> {
    let payment: any = null;

    if (await useDatabase()) {
      payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { events: true },
      });
    } else {
      payment = this.localPayments.find((p) => p.id === paymentId);
    }

    if (!payment) {
      throw new NotFoundException(`Payment '${paymentId}' not found`);
    }

    if (requestingUser) {
      const isAdmin =
        requestingUser.role === UserRole.SUPER_ADMIN ||
        requestingUser.role === UserRole.STORE_ADMIN;
      if (!isAdmin && payment.userId !== requestingUser.id) {
        throw new ForbiddenException('Cannot access another customer payment record');
      }
    }

    return this.formatPayment(payment);
  }

  async getPaymentsByOrder(
    orderId: string,
    requestingUser?: { id: string; role?: string },
  ): Promise<PaymentResponseDto[]> {
    let payments: any[] = [];

    if (await useDatabase()) {
      payments = await prisma.payment.findMany({
        where: { orderId },
        include: { events: true },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      payments = this.localPayments.filter((p) => p.orderId === orderId);
    }

    if (requestingUser && payments.length > 0) {
      const isAdmin =
        requestingUser.role === UserRole.SUPER_ADMIN ||
        requestingUser.role === UserRole.STORE_ADMIN;
      if (!isAdmin && payments[0].userId !== requestingUser.id) {
        throw new ForbiddenException('Cannot access another customer payment history');
      }
    }

    return payments.map((p) => this.formatPayment(p));
  }

  private formatPayment(p: any): PaymentResponseDto {
    return {
      id: p.id,
      orderId: p.orderId,
      userId: p.userId,
      amount: p.amount,
      currency: p.currency,
      status: p.status as PaymentStatus,
      provider: p.provider,
      transactionRef: p.transactionRef,
      idempotencyKey: p.idempotencyKey,
      createdAt: p.createdAt?.toISOString ? p.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: p.updatedAt?.toISOString ? p.updatedAt.toISOString() : new Date().toISOString(),
      events: p.events?.map((e: any) => ({
        id: e.id,
        paymentId: e.paymentId,
        eventType: e.eventType,
        status: e.status as PaymentStatus,
        providerRef: e.providerRef,
        payload: e.payload,
        createdAt: e.createdAt?.toISOString ? e.createdAt.toISOString() : new Date().toISOString(),
      })),
    };
  }
}
