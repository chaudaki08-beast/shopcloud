import { PaymentStatus } from '@shopcloud/contracts';

export interface CreatePaymentSessionParams {
  orderId: string;
  orderNumber: string;
  amount: number; // authoritative integer amount in paise (e.g. 50000 = ₹500.00)
  currency: string; // e.g. "INR"
  customerEmail: string;
  customerName?: string;
  idempotencyKey: string;
  returnUrl?: string;
  metadata?: Record<string, any>;
}

export interface PaymentSessionResult {
  providerRef: string; // provider transaction / session ID
  status: PaymentStatus;
  checkoutUrl?: string;
  clientSecret?: string;
  gatewayData?: Record<string, any>;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  event: 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'REFUND_SUCCESS' | 'IGNORED';
  providerEventId: string;
  providerRef: string; // gateway reference (e.g. pay_xxx, order_xxx)
  orderId?: string;
  amount?: number; // in paise
  currency?: string;
  reason?: string;
  rawPayload: any;
}

export interface RefundParams {
  paymentRef: string;
  amount?: number; // in paise (optional partial refund)
  reason?: string;
  idempotencyKey: string;
}

export interface RefundResult {
  refundRef: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  amount: number;
}

export interface PaymentProvider {
  readonly providerName: string;
  createSession(params: CreatePaymentSessionParams): Promise<PaymentSessionResult>;
  verifyWebhook(headers: Record<string, string>, rawBody: string | Buffer): Promise<WebhookVerificationResult>;
  getPaymentStatus(providerRef: string): Promise<PaymentStatus>;
  refund(params: RefundParams): Promise<RefundResult>;
}
