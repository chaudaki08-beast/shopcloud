import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { TestPaymentAdapter } from './providers/test-payment.adapter';
import { RazorpayPaymentAdapter } from './providers/razorpay.adapter';
import { StripePaymentAdapter } from './providers/stripe.adapter';
import { EVENT_TYPES } from '@shopcloud/contracts';
import { prisma } from '@shopcloud/database';

jest.mock('@shopcloud/database', () => ({
  prisma: {
    $transaction: jest.fn(),
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    paymentEvent: {
      create: jest.fn(),
    },
    orderStatusHistory: {
      create: jest.fn(),
    },
    processedEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
  },
  PaymentStatus: {
    PENDING: 'PENDING',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    REFUNDED: 'REFUNDED',
  },
  OrderStatus: {
    PAYMENT_PENDING: 'PAYMENT_PENDING',
    CONFIRMED: 'CONFIRMED',
    CANCELLED: 'CANCELLED',
    REFUNDED: 'REFUNDED',
  },
}));

jest.mock('../../db-status', () => ({
  useDatabase: jest.fn().mockResolvedValue(true),
}));

describe('Payments Resilience & Webhook Invariant Verification', () => {
  let paymentsService: PaymentsService;
  let mockOutboxService: any;
  let testAdapter: TestPaymentAdapter;
  let razorpayAdapter: RazorpayPaymentAdapter;
  let stripeAdapter: StripePaymentAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOutboxService = {
      recordEvent: jest.fn().mockResolvedValue({ id: 'outbox-pay-1' }),
      dispatchImmediate: jest.fn().mockResolvedValue(true),
    };
    testAdapter = new TestPaymentAdapter();
    razorpayAdapter = new RazorpayPaymentAdapter();
    stripeAdapter = new StripePaymentAdapter();

    paymentsService = new PaymentsService(
      mockOutboxService,
      testAdapter,
      razorpayAdapter,
      stripeAdapter,
    );
  });

  describe('Late Webhook on Cancelled Order', () => {
    it('handles late payment success on cancelled order by recording reconciliation event without failing webhook', async () => {
      const mockOrder = {
        id: 'ord-cancelled-1',
        orderNumber: 'ORD-CANCELLED-1',
        userId: 'usr-1',
        status: 'CANCELLED', // Order is already cancelled
        grandTotal: 199900,
        currency: 'INR',
      };

      const mockPayment = {
        id: 'pay-1',
        orderId: 'ord-cancelled-1',
        userId: 'usr-1',
        amount: 199900,
        currency: 'INR',
        status: 'PENDING',
        transactionRef: 'test_ref_late_123',
        order: mockOrder,
      };

      (prisma.processedEvent.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPayment);

      let recordedOutboxType: string | null = null;
      let recordedAuditAction: string | null = null;

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx: any = {
          payment: { update: jest.fn().mockResolvedValue({}) },
          paymentEvent: { create: jest.fn().mockResolvedValue({}) },
          order: { update: jest.fn().mockResolvedValue({}) },
          orderStatusHistory: { create: jest.fn().mockResolvedValue({}) },
          processedEvent: { create: jest.fn().mockResolvedValue({}) },
          auditLog: {
            create: jest.fn().mockImplementation(async ({ data }: any) => {
              recordedAuditAction = data.action;
              return {};
            }),
          },
        };

        mockOutboxService.recordEvent.mockImplementation(async (_tx: any, envelope: any) => {
          recordedOutboxType = envelope.eventType;
          return { id: 'outbox-recon-1' };
        });

        return callback(mockTx);
      });

      // Prepare valid webhook payload from TEST_SANDBOX
      const webhookData = {
        event: 'payment.succeeded',
        eventId: 'evt-test-late-1',
        providerRef: 'test_ref_late_123',
        orderId: 'ord-cancelled-1',
        amount: 199900,
      };

      const signedWebhook = testAdapter.generateSignedWebhook(webhookData);

      const result = await paymentsService.handleWebhook(
        'TEST_SANDBOX',
        signedWebhook.headers,
        signedWebhook.rawBody,
      );

      expect(result.success).toBe(true);
      expect(result.event).toBe('PAYMENT_SUCCESS');
      // Must NOT fail with 409
      expect(recordedAuditAction).toBe('PAYMENT_RECEIVED_ON_CANCELLED_ORDER');
      // Must emit reconciliation outbox event
      expect(recordedOutboxType).toBe(EVENT_TYPES.PAYMENT_RECONCILIATION_REQUIRED_V1);
    });
  });

  describe('Webhook Idempotency & Duplicate Delivery', () => {
    it('returns DUPLICATE_IGNORED when a webhook is received more than once', async () => {
      // Simulate that this event was already recorded in ProcessedEvent ledger
      (prisma.processedEvent.findUnique as jest.Mock).mockResolvedValue({
        id: 'proc-1',
        eventId: 'evt-dup-1',
        consumer: 'payment-webhook-test_sandbox',
        processedAt: new Date(),
      });

      const payloadData = {
        event: 'payment.succeeded',
        eventId: 'evt-dup-1',
        providerRef: 'test_ref_dup',
        orderId: 'ord-dup-1',
        amount: 100000,
      };

      const signed = testAdapter.generateSignedWebhook(payloadData);

      const result = await paymentsService.handleWebhook(
        'TEST_SANDBOX',
        signed.headers,
        signed.rawBody,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('DUPLICATE_IGNORED');
      // Must not query or mutate payment records
      expect(prisma.payment.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Cryptographic Signature Verification', () => {
    it('rejects forged webhook signature with 401 Unauthorized', async () => {
      const payload = JSON.stringify({
        event: 'payment.succeeded',
        eventId: 'evt-forged-1',
        providerRef: 'test_ref_forged',
      });

      const headers = { 'x-test-signature': 'forged_invalid_hmac_signature' };

      await expect(
        paymentsService.handleWebhook('TEST_SANDBOX', headers, payload),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Payment Initiation Idempotency', () => {
    it('returns existing pending payment when called with duplicate idempotencyKey', async () => {
      const existingPending = {
        id: 'pay-existing-1',
        orderId: 'ord-1',
        amount: 199900,
        currency: 'INR',
        status: 'PENDING',
        provider: 'TEST_SANDBOX',
        transactionRef: 'ref-existing',
        idempotencyKey: 'idem-key-123',
        createdAt: new Date(),
      };

      const mockOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-100',
        userId: 'usr-1',
        status: 'PAYMENT_PENDING',
        grandTotal: 199900,
        currency: 'INR',
        payments: [existingPending],
      };

      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const result = await paymentsService.initiatePayment('usr-1', {
        orderId: 'ord-1',
        provider: 'TEST_SANDBOX',
        idempotencyKey: 'idem-key-123',
      });

      expect(result.paymentId).toBe('pay-existing-1');
      expect(result.status).toBe('PENDING');
      // Must not create new payment in transaction
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects payment initiation for already confirmed and paid order', async () => {
      const mockOrder = {
        id: 'ord-paid',
        orderNumber: 'ORD-PAID-1',
        userId: 'usr-1',
        status: 'CONFIRMED',
        grandTotal: 199900,
        currency: 'INR',
        payments: [],
      };

      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      await expect(
        paymentsService.initiatePayment('usr-1', {
          orderId: 'ord-paid',
          provider: 'TEST_SANDBOX',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
