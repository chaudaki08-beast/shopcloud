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

export class RazorpayPaymentAdapter implements PaymentProvider {
  public readonly providerName = 'RAZORPAY_SANDBOX';
  private readonly keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_key_id';
  private readonly keySecret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret_key';
  private readonly webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_default';

  async createSession(params: CreatePaymentSessionParams): Promise<PaymentSessionResult> {
    // Razorpay strictly operates in Indian Rupees (paise)
    if (params.currency !== 'INR') {
      throw new Error(`Razorpay only supports INR currency for ShopCloud. Received: ${params.currency}`);
    }

    const providerRef = `order_rzp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return {
      providerRef,
      status: PaymentStatus.PENDING,
      checkoutUrl: `https://api.razorpay.com/v1/checkout/${providerRef}`,
      gatewayData: {
        key: this.keyId,
        order_id: providerRef,
        amount: params.amount,
        currency: params.currency,
        name: 'ShopCloud E-Commerce',
        description: `Order #${params.orderNumber}`,
        prefill: {
          email: params.customerEmail,
          name: params.customerName || 'Valued Customer',
        },
      },
    };
  }

  async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string | Buffer,
  ): Promise<WebhookVerificationResult> {
    const signature = headers['x-razorpay-signature'] || '';
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

    if (!signature) {
      return {
        isValid: false,
        event: 'IGNORED',
        providerEventId: '',
        providerRef: '',
        reason: 'Missing x-razorpay-signature header',
        rawPayload: null,
      };
    }

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
        reason: 'Razorpay HMAC signature mismatch',
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
        reason: 'Malformed JSON body',
        rawPayload: null,
      };
    }

    const eventName = parsed.event;
    const paymentEntity = parsed.payload?.payment?.entity;
    const orderEntity = parsed.payload?.order?.entity;

    let mappedEvent: 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'REFUND_SUCCESS' | 'IGNORED' = 'IGNORED';
    if (eventName === 'payment.captured' || eventName === 'order.paid') {
      mappedEvent = 'PAYMENT_SUCCESS';
    } else if (eventName === 'payment.failed') {
      mappedEvent = 'PAYMENT_FAILED';
    } else if (eventName === 'refund.processed') {
      mappedEvent = 'REFUND_SUCCESS';
    }

    return {
      isValid: true,
      event: mappedEvent,
      providerEventId: parsed.id || `evt_rzp_${Date.now()}`,
      providerRef: paymentEntity?.order_id || orderEntity?.id || paymentEntity?.id || '',
      orderId: paymentEntity?.notes?.orderId || orderEntity?.notes?.orderId,
      amount: paymentEntity?.amount || orderEntity?.amount,
      currency: paymentEntity?.currency || 'INR',
      reason: paymentEntity?.error_description || undefined,
      rawPayload: parsed,
    };
  }

  async getPaymentStatus(providerRef: string): Promise<PaymentStatus> {
    return PaymentStatus.PENDING;
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const refundRef = `rfnd_rzp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      refundRef,
      status: 'SUCCESS',
      amount: params.amount || 0,
    };
  }

  /**
   * Helper utility for creating signed Razorpay test webhooks.
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
        'x-razorpay-signature': signature,
        'content-type': 'application/json',
      },
      rawBody,
    };
  }
}
