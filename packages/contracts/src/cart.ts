import { ProductDto } from './product';

export interface CartItemDto {
  id: string;
  productId: string;
  product?: ProductDto;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
}

export interface CartSummaryDto {
  items: CartItemDto[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingFee: number;
  grandTotal: number;
  currency: string;
}

export interface AddToCartDto {
  productId: string;
  quantity: number;
}

export interface UpdateCartItemDto {
  quantity: number;
}
