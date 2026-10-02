import { OrderStatus } from './enums';

export interface ShippingAddressDto {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  recipientName: string;
  phoneNumber: string;
}

export interface OrderItemDto {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
}

export interface OrderResponseDto {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingFee: number;
  grandTotal: number;
  currency: string;
  shippingAddress: ShippingAddressDto;
  items: OrderItemDto[];
  paymentId?: string;
  trackingNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderDto {
  shippingAddress: ShippingAddressDto;
  paymentMethod: 'SANDBOX_STRIPE' | 'SANDBOX_RAZORPAY';
  notes?: string;
}
