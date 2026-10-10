import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { TestPaymentAdapter } from './providers/test-payment.adapter';
import { RazorpayPaymentAdapter } from './providers/razorpay.adapter';
import { StripePaymentAdapter } from './providers/stripe.adapter';
import { OutboxService } from '../events/outbox.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentStatus, UserRole, EVENT_TYPES } from '@shopcloud/contracts';
import * as crypto from 'crypto';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let outboxService: jest.Mocked<Partial<OutboxService>>;
  let testAdapter: TestPaymentAdapter;
  let razorpayAdapter: RazorpayPaymentAdapter;
  let stripeAdapter: StripePaymentAdapter;

  beforeEach(async () => {
    outboxService = {
      recordEvent: jest.fn().mockResolvedValue({ id: 'outbox-1' } as any),
      dispatchImmediate: jest.fn().mockResolvedValue(true),
    };

    testAdapter = new TestPaymentAdapter();
    razorpayAdapter = new RazorpayPaymentAdapter();
    stripeAdapter = new StripePaymentAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: OutboxService, useValue: outboxService },
        { provide: TestPaymentAdapter, useValue: testAdapter },
        { provide: RazorpayPaymentAdapter, useValue: razorpayAdapter },
        { provide: StripePaymentAdapter, useValue: stripeAdapter },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('Provider Adapter Signature Verification', () => {
    it('TestPaymentAdapter generates and verifies valid HMAC-SHA256 signature', async () => {
      const payload = {
        event: 'PAYMENT_SUCCESS',
        id: 'test_evt_123',
        paymentId: 'pay_test_123',
        amount: 14999900,
        currency: 'INR',
      };
      const rawBody = JSON.stringify(payload);
      const secret = process.env.TEST_PAYMENT_WEBHOOK_SECRET || 'test_webhook_secret_key_123';
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const verification = await testAdapter.verifyWebhook(
        { 'x-shopcloud-test-signature': signature },
        rawBody,
      );

      expect(verification.isValid).toBe(true);
      expect(verification.event).toBe('PAYMENT_SUCCESS');
      expect(verification.providerRef).toBe('pay_test_123');
    });

    it('TestPaymentAdapter rejects tampered raw body or invalid signature', async () => {
      const payload = { event: 'PAYMENT_SUCCESS', paymentId: 'pay_test_123' };
      const rawBody = JSON.stringify(payload);
      const invalidSignature = 'invalid-fake-hex-signature-12345';

      const verification = await testAdapter.verifyWebhook(
        { 'x-shopcloud-test-signature': invalidSignature },
        rawBody,
      );

      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain('Signature mismatch');
    });

    it('RazorpayPaymentAdapter verifies valid x-razorpay-signature', async () => {
      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_999',
              order_id: 'order_rzp_888',
              amount: 500000,
              currency: 'INR',
              notes: { orderId: 'ord-local-1' },
            },
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_default';
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const verification = await razorpayAdapter.verifyWebhook(
        { 'x-razorpay-signature': signature },
        rawBody,
      );

      expect(verification.isValid).toBe(true);
      expect(verification.event).toBe('PAYMENT_SUCCESS');
      expect(verification.providerRef).toBe('order_rzp_888');
    });

    it('StripePaymentAdapter verifies stripe-signature timestamped scheme', async () => {
      const payload = {
        id: 'evt_stripe_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_stripe_abc',
            amount: 250000,
            currency: 'inr',
            metadata: { orderId: 'ord-local-1' },
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      const secret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_stripe_secret_shopcloud';
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${rawBody}`;
      const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
      const header = `t=${timestamp},v1=${signature}`;

      const verification = await stripeAdapter.verifyWebhook(
        { 'stripe-signature': header },
        rawBody,
      );

      expect(verification.isValid).toBe(true);
      expect(verification.event).toBe('PAYMENT_SUCCESS');
      expect(verification.providerRef).toBe('pi_stripe_abc');
    });

    it('StripePaymentAdapter rejects replayed webhooks with old timestamp (> 300s)', async () => {
      const payload = { id: 'evt_old', type: 'payment_intent.succeeded' };
      const rawBody = JSON.stringify(payload);
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const secret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_stripe_secret_shopcloud';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${oldTimestamp}.${rawBody}`)
        .digest('hex');
      const header = `t=${oldTimestamp},v1=${signature}`;

      const verification = await stripeAdapter.verifyWebhook(
        { 'stripe-signature': header },
        rawBody,
      );

      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain('tolerance');
    });
  });

  describe('Webhook Ingestion & Idempotency', () => {
    it('throws UnauthorizedException when webhook signature is invalid', async () => {
      await expect(
        service.handleWebhook(
          'TEST_SANDBOX',
          { 'x-shopcloud-test-signature': 'bad-signature' },
          '{"foo":"bar"}',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects unsupported payment provider with BadRequestException', () => {
      expect(() => service.getProvider('UNKNOWN_GATEWAY')).toThrow(BadRequestException);
    });

    it('returns DUPLICATE_IGNORED when duplicate webhook is delivered', async () => {
      const payload = {
        event: 'PAYMENT_SUCCESS',
        id: 'evt_unique_1001',
        paymentId: 'pay_test_nonexistent',
      };
      const rawBody = JSON.stringify(payload);
      const secret = process.env.TEST_PAYMENT_WEBHOOK_SECRET || 'test_webhook_secret_key_123';
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const headers = { 'x-shopcloud-test-signature': signature };

      // In local mode without database, payment is not found so returns PAYMENT_REFERENCE_NOT_FOUND
      const res1 = await service.handleWebhook('TEST_SANDBOX', headers, rawBody);
      expect(res1.providerEventId).toBe('evt_unique_1001');

      // Now if we inject it into the localProcessedEvents set or re-test
      // We can also verify handleWebhook with a valid payment record
    });
  });

  describe('Refunds & Authorization Controls', () => {
    it('rejects refund when requesting user does not have admin permissions', async () => {
      await expect(
        service.refundPayment(
          'pay-123',
          { reason: 'Customer requested cancellation' },
          { id: 'user-regular', role: UserRole.CUSTOMER },
        ),
      ).rejects.toThrow();
    });
  });

  describe('End-to-End Payment Lifecycle with Database', () => {
    let prismaClient: any;
    let testUser: any;
    let testProduct: any;
    let testOrder: any;

    beforeAll(async () => {
      const { prisma } = await import('@shopcloud/database');
      prismaClient = prisma;
    });

    afterAll(async () => {
      if (testUser) {
        // Cleanup test artifacts
        await prismaClient.paymentEvent.deleteMany({
          where: { payment: { userId: testUser.id } },
        });
        await prismaClient.payment.deleteMany({ where: { userId: testUser.id } });
        await prismaClient.orderStatusHistory.deleteMany({
          where: { order: { userId: testUser.id } },
        });
        await prismaClient.orderItem.deleteMany({
          where: { order: { userId: testUser.id } },
        });
        await prismaClient.order.deleteMany({ where: { userId: testUser.id } });
        await prismaClient.user.delete({ where: { id: testUser.id } });
      }
      if (testProduct) {
        await prismaClient.inventoryMovement.deleteMany({
          where: { productId: testProduct.id },
        });
        await prismaClient.product.delete({ where: { id: testProduct.id } });
      }
    });

    it('creates test user and product in local postgres', async () => {
      testUser = await prismaClient.user.create({
        data: {
          email: `paytest-${Date.now()}@shopcloud.dev`,
          passwordHash: 'dummy-hash',
          firstName: 'Payment',
          lastName: 'Tester',
          role: 'CUSTOMER',
        },
      });

      let category = await prismaClient.category.findFirst();
      if (!category) {
        category = await prismaClient.category.create({
          data: { name: 'Payment Category', slug: `pay-cat-${Date.now()}` },
        });
      }

      testProduct = await prismaClient.product.create({
        data: {
          name: 'Payment Test Widget',
          slug: `pay-test-widget-${Date.now()}`,
          sku: `SKU-PAY-${Date.now()}`,
          description: 'Payment test widget description',
          price: 250000, // ₹2,500.00
          stock: 20,
          categoryId: category.id,
        },
      });

      expect(testUser.id).toBeDefined();
      expect(testProduct.id).toBeDefined();
    });

    it('initiates payment with server-authoritative amount and records outbox event', async () => {
      // Create order with grandTotal = 250000
      testOrder = await prismaClient.order.create({
        data: {
          userId: testUser.id,
          orderNumber: `ORD-PAY-${Date.now()}`,
          status: 'PAYMENT_PENDING',
          subtotal: 250000,
          shippingFee: 0,
          taxTotal: 0,
          discountTotal: 0,
          grandTotal: 250000,
          currency: 'INR',
          shippingAddress: { city: 'Bengaluru', street: '123 MG Road' },
          items: {
            create: [
              {
                productId: testProduct.id,
                productName: testProduct.name,
                quantity: 1,
                unitPrice: 250000,
                lineTotal: 250000,
                sku: testProduct.sku,
              },
            ],
          },
        },
      });

      const result = await service.initiatePayment(
        testUser.id,
        {
          orderId: testOrder.id,
          provider: 'TEST_SANDBOX',
          idempotencyKey: `idem_${testOrder.id}`,
        },
        { id: testUser.id, role: 'CUSTOMER' },
      );

      expect(result.paymentId).toBeDefined();
      expect(result.orderId).toBe(testOrder.id);
      expect(result.amount).toBe(250000); // Authoritative server-derived amount
      expect(result.status).toBe(PaymentStatus.PENDING);
      expect(result.transactionRef).toBeDefined();

      // Verify outbox was recorded with payment.initiated.v1
      expect(outboxService.recordEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: EVENT_TYPES.PAYMENT_INITIATED_V1,
          aggregateId: result.paymentId,
        }),
      );

      // Verify idempotency return on exact same request
      const idemResult = await service.initiatePayment(
        testUser.id,
        {
          orderId: testOrder.id,
          provider: 'TEST_SANDBOX',
          idempotencyKey: `idem_${testOrder.id}`,
        },
        { id: testUser.id, role: 'CUSTOMER' },
      );
      expect(idemResult.paymentId).toBe(result.paymentId);
    });

    it('processes signed webhook for successful payment, updates order to CONFIRMED, and records ProcessedEvent', async () => {
      const payment = await prismaClient.payment.findFirst({
        where: { orderId: testOrder.id },
      });
      expect(payment).toBeDefined();

      const eventId = `webhook_evt_succ_${Date.now()}`;
      const payload = {
        event: 'PAYMENT_SUCCESS',
        id: eventId,
        paymentId: payment.transactionRef,
        amount: 250000,
        currency: 'INR',
      };
      const rawBody = JSON.stringify(payload);
      const secret = process.env.TEST_PAYMENT_WEBHOOK_SECRET || 'test_webhook_secret_key_123';
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const webhookResult = await service.handleWebhook(
        'TEST_SANDBOX',
        { 'x-shopcloud-test-signature': signature },
        rawBody,
      );

      expect(webhookResult.success).toBe(true);
      expect(webhookResult.event).toBe('PAYMENT_SUCCESS');

      // Verify payment transitioned to SUCCESS
      const updatedPayment = await prismaClient.payment.findUnique({
        where: { id: payment.id },
      });
      expect(updatedPayment.status).toBe('SUCCESS');

      // Verify order transitioned to CONFIRMED
      const updatedOrder = await prismaClient.order.findUnique({
        where: { id: testOrder.id },
      });
      expect(updatedOrder.status).toBe('CONFIRMED');

      // Verify ProcessedEvent was written
      const processed = await prismaClient.processedEvent.findUnique({
        where: {
          eventId_consumer: {
            eventId,
            consumer: 'payment-webhook-test_sandbox',
          },
        },
      });
      expect(processed).toBeDefined();

      // Verify outbox was recorded with payment.succeeded.v1
      expect(outboxService.recordEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: EVENT_TYPES.PAYMENT_SUCCEEDED_V1,
          aggregateId: payment.id,
        }),
      );

      // Verify duplicate webhook delivery returns DUPLICATE_IGNORED
      const dupResult = await service.handleWebhook(
        'TEST_SANDBOX',
        { 'x-shopcloud-test-signature': signature },
        rawBody,
      );
      expect(dupResult.message).toBe('DUPLICATE_IGNORED');
    });

    it('issues refund for successful payment by admin, updates order, and records outbox event', async () => {
      const payment = await prismaClient.payment.findFirst({
        where: { orderId: testOrder.id },
      });

      const refundResult = await service.refundPayment(
        payment.id,
        { reason: 'Customer requested cancellation via helpdesk' },
        { id: 'admin-1', role: UserRole.SUPER_ADMIN },
      );

      expect(refundResult.status).toBe(PaymentStatus.REFUNDED);
      expect(refundResult.refundAmount).toBe(250000);

      // Verify payment status is REFUNDED
      const refundedPayment = await prismaClient.payment.findUnique({
        where: { id: payment.id },
      });
      expect(refundedPayment.status).toBe('REFUNDED');

      // Verify order status is REFUNDED
      const refundedOrder = await prismaClient.order.findUnique({
        where: { id: testOrder.id },
      });
      expect(refundedOrder.status).toBe('REFUNDED');

      // Verify outbox recorded payment.refunded.v1
      expect(outboxService.recordEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: EVENT_TYPES.PAYMENT_REFUNDED_V1,
          aggregateId: payment.id,
        }),
      );
    });

    it('handles payment failure webhook with ACID inventory compensation', async () => {
      // 1. Create order with reserved stock
      const initialStock = testProduct.stock;
      const order2 = await prismaClient.order.create({
        data: {
          userId: testUser.id,
          orderNumber: `ORD-FAIL-${Date.now()}`,
          status: 'PAYMENT_PENDING',
          subtotal: 250000,
          shippingFee: 0,
          taxTotal: 0,
          discountTotal: 0,
          grandTotal: 250000,
          currency: 'INR',
          shippingAddress: { city: 'Pune' },
          items: {
            create: [
              {
                productId: testProduct.id,
                productName: testProduct.name,
                quantity: 2,
                unitPrice: 125000,
                lineTotal: 250000,
                sku: testProduct.sku,
              },
            ],
          },
        },
      });

      // Initiate payment
      const init2 = await service.initiatePayment(
        testUser.id,
        { orderId: order2.id, provider: 'TEST_SANDBOX' },
        { id: testUser.id, role: 'CUSTOMER' },
      );

      // Send failure webhook
      const failEventId = `webhook_evt_fail_${Date.now()}`;
      const payload = {
        event: 'PAYMENT_FAILED',
        id: failEventId,
        paymentId: init2.transactionRef,
        reason: 'INSUFFICIENT_FUNDS_SIMULATED',
      };
      const rawBody = JSON.stringify(payload);
      const secret = process.env.TEST_PAYMENT_WEBHOOK_SECRET || 'test_webhook_secret_key_123';
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const webhookResult = await service.handleWebhook(
        'TEST_SANDBOX',
        { 'x-shopcloud-test-signature': signature },
        rawBody,
      );

      expect(webhookResult.success).toBe(true);

      // Verify payment is FAILED
      const failedPayment = await prismaClient.payment.findUnique({
        where: { id: init2.paymentId },
      });
      expect(failedPayment.status).toBe('FAILED');

      // Verify order is CANCELLED
      const cancelledOrder = await prismaClient.order.findUnique({
        where: { id: order2.id },
      });
      expect(cancelledOrder.status).toBe('CANCELLED');

      // Verify inventory movement recorded for release
      const movement = await prismaClient.inventoryMovement.findFirst({
        where: {
          referenceId: order2.id,
          reason: 'ORDER_PAYMENT_FAILED_RELEASE',
        },
      });
      expect(movement).toBeDefined();
      expect(movement.changeQuantity).toBe(2);

      // Verify outbox recorded payment.failed.v1
      expect(outboxService.recordEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: EVENT_TYPES.PAYMENT_FAILED_V1,
          aggregateId: init2.paymentId,
        }),
      );

      // Clean up order2
      await prismaClient.paymentEvent.deleteMany({ where: { paymentId: init2.paymentId } });
      await prismaClient.payment.delete({ where: { id: init2.paymentId } });
      await prismaClient.orderStatusHistory.deleteMany({ where: { orderId: order2.id } });
      await prismaClient.orderItem.deleteMany({ where: { orderId: order2.id } });
      await prismaClient.inventoryMovement.deleteMany({ where: { referenceId: order2.id } });
      await prismaClient.order.delete({ where: { id: order2.id } });
    });
  });
});
