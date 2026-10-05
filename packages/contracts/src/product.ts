import type { CategoryDto } from './category';

export type { CategoryDto } from './category';

export interface ProductImageDto {
  id: string;
  url: string;
  isPrimary: boolean;
  altText?: string;
  storageKey?: string;
  mimeType?: string;
  fileSize?: number;
}

export interface ProductDto {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  price: number; // in integer paise / cents (e.g. 12999900 for ₹129,999.00)
  discountPercentage: number;
  stock: number;
  categoryId: string;
  category?: CategoryDto;
  images: ProductImageDto[];
  isActive: boolean;
  attributes: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductDto {
  name: string;
  sku: string;
  description: string;
  price: number;
  discountPercentage?: number;
  stock: number;
  categoryId: string;
  images?: Array<{ url: string; isPrimary: boolean; altText?: string }>;
  attributes?: Record<string, string | number | boolean>;
  isActive?: boolean;
}

export interface UpdateProductDto extends Partial<CreateProductDto> {}

export interface ProductQueryDto {
  page?: number;
  limit?: number;
  categoryId?: string;
  categorySlug?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: 'ACTIVE' | 'INACTIVE';
  inStockOnly?: boolean;
  sortBy?: 'name' | 'price' | 'createdAt' | 'updatedAt' | 'price_asc' | 'price_desc' | 'name_asc' | 'created_at_desc';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  success?: boolean;
  data: T[];
  meta: PaginationMeta;
  // Backward compatibility fields
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: PaginationMeta;
  error?: {
    code: string;
    message: string;
    details?: any[];
  };
  timestamp?: string;
}
