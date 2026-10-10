import { PaymentStatus } from './enums';

export interface InitiatePaymentDto {
  orderId: string;
  provider?: 'TEST_SANDBOX' | 'RAZORPAY_SANDBOX' | 'STRIPE_SANDBOX';
  idempotencyKey?: string;
  returnUrl?: string;
}

export interface InitiatePaymentResponseDto {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  amount: number; // in paise
  currency: string;
  status: PaymentStatus;
  provider: string;
  transactionRef?: string;
  checkoutUrl?: string;
  clientSecret?: string;
  gatewayData?: Record<string, any>;
  createdAt: string;
}

export interface PaymentEventDto {
  id: string;
  paymentId: string;
  eventType: string;
  status: PaymentStatus;
  providerRef?: string | null;
  payload?: any;
  createdAt: string;
}

export interface PaymentResponseDto {
  id: string;
  orderId: string;
  userId: string;
  amount: number; // in paise
  currency: string;
  status: PaymentStatus;
  provider: string;
  transactionRef?: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  events?: PaymentEventDto[];
}

export interface RefundPaymentDto {
  amount?: number; // in paise (optional partial refund)
  reason?: string;
  idempotencyKey?: string;
}

export interface RefundPaymentResponseDto {
  paymentId: string;
  orderId: string;
  refundRef: string;
  status: PaymentStatus;
  refundAmount: number; // in paise
  currency: string;
  refundedAt: string;
}

export interface WebhookResultDto {
  success: boolean;
  event: string;
  providerEventId: string;
  message?: string;
}
