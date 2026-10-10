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

export class StripePaymentAdapter implements PaymentProvider {
  public readonly providerName = 'STRIPE_SANDBOX';
  private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_stripe_secret_shopcloud';

  async createSession(params: CreatePaymentSessionParams): Promise<PaymentSessionResult> {
    const providerRef = `cs_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      providerRef,
      status: PaymentStatus.PENDING,
      checkoutUrl: `https://checkout.stripe.com/pay/${providerRef}`,
      clientSecret: `pi_test_${providerRef}_secret`,
      gatewayData: {
        id: providerRef,
        amount: params.amount,
        currency: params.currency.toLowerCase(),
      },
    };
  }

  async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string | Buffer,
  ): Promise<WebhookVerificationResult> {
    const signatureHeader = headers['stripe-signature'] || '';
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

    if (!signatureHeader) {
      return {
        isValid: false,
        event: 'IGNORED',
        providerEventId: '',
        providerRef: '',
        reason: 'Missing stripe-signature header',
        rawPayload: null,
      };
    }

    // Parse timestamp and v1 signature from Stripe-Signature header
    const parts = signatureHeader.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      if (key && value) acc[key.trim()] = value.trim();
      return acc;
    }, {} as Record<string, string>);

    const timestamp = parts['t'];
    const signature = parts['v1'];

    if (!timestamp || !signature) {
      return {
        isValid: false,
        event: 'IGNORED',
        providerEventId: '',
        providerRef: '',
        reason: 'Malformed stripe-signature header',
        rawPayload: null,
      };
    }

    // Replay tolerance protection: 5 minutes (300 seconds)
    const now = Math.floor(Date.now() / 1000);
    const eventTime = parseInt(timestamp, 10);
    if (Math.abs(now - eventTime) > 300) {
      return {
        isValid: false,
        event: 'IGNORED',
        providerEventId: '',
        providerRef: '',
        reason: 'Webhook timestamp outside tolerance window (replay protection)',
        rawPayload: null,
      };
    }

    const signedPayload = `${timestamp}.${bodyStr}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
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
        reason: 'Stripe signature mismatch',
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

    const type = parsed.type;
    const sessionOrIntent = parsed.data?.object;

    let mappedEvent: 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'REFUND_SUCCESS' | 'IGNORED' = 'IGNORED';
    if (type === 'payment_intent.succeeded' || type === 'checkout.session.completed') {
      mappedEvent = 'PAYMENT_SUCCESS';
    } else if (type === 'payment_intent.payment_failed') {
      mappedEvent = 'PAYMENT_FAILED';
    } else if (type === 'charge.refunded') {
      mappedEvent = 'REFUND_SUCCESS';
    }

    return {
      isValid: true,
      event: mappedEvent,
      providerEventId: parsed.id || `evt_stripe_${Date.now()}`,
      providerRef: sessionOrIntent?.id || '',
      orderId: sessionOrIntent?.metadata?.orderId,
      amount: sessionOrIntent?.amount,
      currency: sessionOrIntent?.currency?.toUpperCase() || 'INR',
      reason: sessionOrIntent?.last_payment_error?.message,
      rawPayload: parsed,
    };
  }

  async getPaymentStatus(providerRef: string): Promise<PaymentStatus> {
    return PaymentStatus.PENDING;
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const refundRef = `re_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      refundRef,
      status: 'SUCCESS',
      amount: params.amount || 0,
    };
  }

  generateSignedWebhook(payload: Record<string, any>, timestampOffsetSec = 0): {
    headers: Record<string, string>;
    rawBody: string;
  } {
    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000) + timestampOffsetSec;
    const signedPayload = `${timestamp}.${rawBody}`;
    const signature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    return {
      headers: {
        'stripe-signature': `t=${timestamp},v1=${signature}`,
        'content-type': 'application/json',
      },
      rawBody,
    };
  }
}
