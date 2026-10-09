import { PubSubTopic, OrderStatus } from './enums';

/**
 * Standard ShopCloud Event Envelope (Phase 10)
 * Compliant with Cloud Native event architecture standards.
 */
export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  eventVersion: string;
  occurredAt: string; // ISO 8601
  producer: string; // e.g., 'shopcloud-api' | 'shopcloud-inventory-worker'
  correlationId: string;
  causationId?: string;
  aggregateType: string; // e.g., 'Order' | 'Product' | 'Inventory' | 'Notification'
  aggregateId: string; // business entity ID
  payload: T;
}

/**
 * CloudEvent v1.0 Envelope for interoperability
 */
export interface CloudEventEnvelope<T = unknown> {
  specversion: '1.0';
  type: string;
  source: string;
  id: string;
  time: string;
  datacontenttype: 'application/json';
  data: T;
  // CloudEvents extension attributes for tracing & taxonomy
  correlationid?: string;
  causationid?: string;
  aggregatetype?: string;
  aggregateid?: string;
  eventversion?: string;
}

/**
 * Canonical Event Taxonomy Constants
 */
export const EVENT_TYPES = {
  ORDER_CREATED_V1: 'order.created.v1',
  ORDER_CONFIRMED_V1: 'order.confirmed.v1',
  ORDER_CANCELLED_V1: 'order.cancelled.v1',
  INVENTORY_RESERVATION_REQUESTED_V1: 'inventory.reservation.requested.v1',
  INVENTORY_RESERVED_V1: 'inventory.reserved.v1',
  INVENTORY_RELEASED_V1: 'inventory.released.v1',
  NOTIFICATION_REQUESTED_V1: 'notification.requested.v1',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// ==========================================
// Event Payloads
// ==========================================

export interface OrderItemPayload {
  productId: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  items: OrderItemPayload[];
  totalAmount: number; // in paise
  currency: string;
  createdAt: string;
}

// Backward-compatible alias
export type OrderCreatedEvent = OrderCreatedPayload;

export interface OrderConfirmedPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  confirmedAt: string;
}

export type OrderConfirmedEvent = OrderConfirmedPayload;

export interface OrderCancelledPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  reason: string;
  cancelledAt: string;
}

export type OrderCancelledEvent = OrderCancelledPayload;

export interface InventoryReservationRequestedPayload {
  orderId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  requestedAt: string;
}

export type InventoryReservationRequestedEvent = InventoryReservationRequestedPayload;

export interface InventoryReservedPayload {
  orderId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  reservedAt: string;
  status: 'RESERVED' | 'OUT_OF_STOCK';
}

export type InventoryReservedEvent = InventoryReservedPayload;

export interface InventoryReleasedPayload {
  orderId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  reason: string;
  releasedAt: string;
}

export type InventoryReleasedEvent = InventoryReleasedPayload;

export interface NotificationRequestedPayload {
  recipientEmail: string;
  recipientName: string;
  template: 'ORDER_CONFIRMATION' | 'ORDER_SHIPPED' | 'ORDER_DELIVERED' | 'PAYMENT_FAILED';
  variables: Record<string, string | number>;
  orderId?: string;
  correlationId?: string;
}

export type NotificationRequestedEvent = NotificationRequestedPayload;

// Future Phase 11 contracts
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

// ==========================================
// Helper functions for Envelope Conversion
// ==========================================

export function toCloudEvent<T>(envelope: EventEnvelope<T>): CloudEventEnvelope<T> {
  return {
    specversion: '1.0',
    type: envelope.eventType,
    source: envelope.producer,
    id: envelope.eventId,
    time: envelope.occurredAt,
    datacontenttype: 'application/json',
    data: envelope.payload,
    correlationid: envelope.correlationId,
    causationid: envelope.causationId,
    aggregatetype: envelope.aggregateType,
    aggregateid: envelope.aggregateId,
    eventversion: envelope.eventVersion,
  };
}

export function fromCloudEvent<T>(cloudEvent: CloudEventEnvelope<T>): EventEnvelope<T> {
  return {
    eventId: cloudEvent.id,
    eventType: cloudEvent.type,
    eventVersion: cloudEvent.eventversion || 'v1',
    occurredAt: cloudEvent.time,
    producer: cloudEvent.source,
    correlationId: cloudEvent.correlationid || cloudEvent.id,
    causationId: cloudEvent.causationid,
    aggregateType: cloudEvent.aggregatetype || 'Unknown',
    aggregateId: cloudEvent.aggregateid || cloudEvent.id,
    payload: cloudEvent.data,
  };
}
