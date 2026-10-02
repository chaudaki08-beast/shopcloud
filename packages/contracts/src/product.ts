export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImageDto {
  id: string;
  url: string;
  isPrimary: boolean;
  altText?: string;
}

export interface ProductDto {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  price: number; // in cents or currency subunits (e.g. INR paise or standard currency)
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
}

export interface UpdateProductDto extends Partial<CreateProductDto> {
  isActive?: boolean;
}

export interface ProductQueryDto {
  page?: number;
  limit?: number;
  categorySlug?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'created_at_desc' | 'name_asc';
  inStockOnly?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
