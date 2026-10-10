import * as crypto from 'crypto';
import { PaymentStatus } from '@shopcloud/contracts';
import {
  PaymentProvider,
  CreatePaymentSessionParams,
  PaymentSessionResult,
  WebhookVerificationResult,
  RefundParams,
  RefundResult,
} from './payment-provider.interface';

export class TestPaymentAdapter implements PaymentProvider {
  public readonly providerName = 'TEST_SANDBOX';
  private readonly webhookSecret = process.env.TEST_PAYMENT_WEBHOOK_SECRET || 'test_webhook_secret_key_123';

  async createSession(params: CreatePaymentSessionParams): Promise<PaymentSessionResult> {
    const providerRef = `test_order_${params.orderId.substring(0, 8)}_${Date.now()}`;

    // Allow simulating failure during testing if orderNumber contains 'FAIL'
    if (params.orderNumber.includes('FAIL')) {
      return {
        providerRef,
        status: PaymentStatus.FAILED,
        gatewayData: { simulatedFailure: true, reason: 'SIMULATED_TEST_FAILURE' },
      };
    }

    return {
      providerRef,
      status: PaymentStatus.PENDING,
      checkoutUrl: `https://test-checkout.shopcloud.dev/pay/${providerRef}`,
      clientSecret: `test_sec_${providerRef}`,
      gatewayData: {
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        amount: params.amount,
        currency: params.currency,
      },
    };
  }

  async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string | Buffer,
  ): Promise<WebhookVerificationResult> {
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const signature = headers['x-shopcloud-test-signature'] || headers['x-test-signature'] || '';

    if (!signature) {
      return {
        isValid: false,
        event: 'IGNORED',
        providerEventId: '',
        providerRef: '',
        reason: 'Missing test signature header',
        rawPayload: null,
      };
    }

    // Compute expected HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(bodyStr)
      .digest('hex');

    let isValid = false;
    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8'),
      );
    } catch {
      isValid = false;
    }

    if (!isValid) {
      return {
        isValid: false,
        event: 'IGNORED',
        providerEventId: '',
        providerRef: '',
        reason: 'Signature mismatch',
        rawPayload: null,
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(bodyStr);
    } catch {
      return {
        isValid: false,
        event: 'IGNORED',
        providerEventId: '',
        providerRef: '',
        reason: 'Malformed JSON payload',
        rawPayload: null,
      };
    }

    const event = parsed.event as 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'REFUND_SUCCESS' | 'IGNORED';
    return {
      isValid: true,
      event: event || 'PAYMENT_SUCCESS',
      providerEventId: parsed.id || `test_evt_${Date.now()}`,
      providerRef: parsed.providerRef || parsed.paymentId || '',
      orderId: parsed.orderId,
      amount: parsed.amount,
      currency: parsed.currency || 'INR',
      reason: parsed.reason,
      rawPayload: parsed,
    };
  }

  async getPaymentStatus(providerRef: string): Promise<PaymentStatus> {
    if (providerRef.includes('fail')) return PaymentStatus.FAILED;
    if (providerRef.includes('succ')) return PaymentStatus.SUCCESS;
    return PaymentStatus.PENDING;
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const refundRef = `test_rfnd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      refundRef,
      status: 'SUCCESS',
      amount: params.amount || 0,
    };
  }

  /**
   * Helper utility for tests to generate authentic signed test webhooks.
   */
  generateSignedWebhook(payload: Record<string, any>): {
    headers: Record<string, string>;
    rawBody: string;
  } {
    const rawBody = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    return {
      headers: {
        'x-shopcloud-test-signature': signature,
        'content-type': 'application/json',
      },
      rawBody,
    };
  }
}
