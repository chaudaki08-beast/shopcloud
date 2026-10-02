import { PubSubTopic, OrderStatus } from './enums';

export interface CloudEventEnvelope<T> {
  specversion: '1.0';
  type: string;
  source: string;
  id: string;
  time: string;
  datacontenttype: 'application/json';
  data: T;
}

export interface OrderCreatedEvent {
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  items: Array<{
    productId: string;
    sku: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  currency: string;
  createdAt: string;
}

export interface PaymentCompletedEvent {
  paymentId: string;
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  provider: string;
  transactionRef: string;
  completedAt: string;
}

export interface PaymentFailedEvent {
  orderId: string;
  userId: string;
  amount: number;
  reason: string;
  failedAt: string;
}

export interface InventoryReservedEvent {
  orderId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  status: 'RESERVED' | 'OUT_OF_STOCK';
}

export interface InventoryReleasedEvent {
  orderId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  reason: string;
}

export interface NotificationRequestedEvent {
  recipientEmail: string;
  recipientName: string;
  template: 'ORDER_CONFIRMATION' | 'ORDER_SHIPPED' | 'ORDER_DELIVERED' | 'PAYMENT_FAILED';
  variables: Record<string, string | number>;
  orderId?: string;
}
