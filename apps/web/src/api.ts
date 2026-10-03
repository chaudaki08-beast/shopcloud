import {
  ProductDto,
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  PaginatedResult,
  CartSummaryDto,
  OrderResponseDto,
  HealthStatusDto,
  CreateOrderDto,
  AuthResponseDto,
  LoginRequestDto,
  RegisterRequestDto,
  OrderStatus,
} from '@shopcloud/contracts';

const API_BASE = '/api/v1';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('shopcloud_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ message: res.statusText }));
    const errorMessage =
      errorBody.error?.message || errorBody.message || `Request failed with status ${res.status}`;
    throw new Error(errorMessage);
  }

  const json = await res.json();
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    if ('meta' in json) {
      return {
        data: json.data,
        meta: json.meta,
        total: json.meta.total,
        page: json.meta.page,
        limit: json.meta.limit,
        totalPages: json.meta.totalPages,
      } as any;
    }
    return json.data;
  }
  return json;
}

export const api = {
  // Auth
  login: (dto: LoginRequestDto) =>
    request<AuthResponseDto>('/auth/login', { method: 'POST', body: JSON.stringify(dto) }),
  register: (dto: RegisterRequestDto) =>
    request<AuthResponseDto>('/auth/register', { method: 'POST', body: JSON.stringify(dto) }),
  refreshToken: (refreshToken: string) =>
    request<{ accessToken: string; refreshToken: string; expiresIn: number }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  logout: () => request<{ success: boolean; message: string }>('/auth/logout', { method: 'POST' }),
  getProfile: () => request<any>('/auth/me'),

  // Products
  getProducts: (params?: {
    categoryId?: string;
    categorySlug?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    status?: 'ACTIVE' | 'INACTIVE';
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const query = new URLSearchParams();
    if (params?.categoryId) query.append('categoryId', params.categoryId);
    if (params?.categorySlug) query.append('categorySlug', params.categorySlug);
    if (params?.search) query.append('search', params.search);
    if (params?.minPrice !== undefined) query.append('minPrice', params.minPrice.toString());
    if (params?.maxPrice !== undefined) query.append('maxPrice', params.maxPrice.toString());
    if (params?.status) query.append('status', params.status);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.sortBy) query.append('sortBy', params.sortBy);
    if (params?.sortOrder) query.append('sortOrder', params.sortOrder);
    return request<PaginatedResult<ProductDto>>(`/products?${query.toString()}`);
  },
  getProduct: (idOrSlug: string) => request<ProductDto>(`/products/${idOrSlug}`),
  createProduct: (dto: CreateProductDto) =>
    request<ProductDto>('/products', { method: 'POST', body: JSON.stringify(dto) }),
  updateProduct: (id: string, dto: UpdateProductDto) =>
    request<ProductDto>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  deleteProduct: (id: string) =>
    request<{ success: boolean; message: string }>(`/products/${id}`, { method: 'DELETE' }),

  // Categories
  getCategories: () => request<CategoryDto[]>('/categories'),
  getCategory: (idOrSlug: string) => request<CategoryDto>(`/categories/${idOrSlug}`),
  createCategory: (dto: CreateCategoryDto) =>
    request<CategoryDto>('/categories', { method: 'POST', body: JSON.stringify(dto) }),
  updateCategory: (id: string, dto: UpdateCategoryDto) =>
    request<CategoryDto>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  deleteCategory: (id: string) =>
    request<{ success: boolean; message: string }>(`/categories/${id}`, { method: 'DELETE' }),

  // Cart
  getCart: () => request<CartSummaryDto>('/cart'),
  addToCart: (productId: string, quantity = 1) =>
    request<CartSummaryDto>('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    }),
  updateCartQuantity: (productId: string, quantity: number) =>
    request<CartSummaryDto>(`/cart/items/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }),
  removeFromCart: (productId: string) =>
    request<CartSummaryDto>(`/cart/items/${productId}`, { method: 'DELETE' }),
  clearCart: () => request<{ success: boolean; message: string }>('/cart', { method: 'DELETE' }),

  // Orders
  createOrder: (dto: CreateOrderDto) =>
    request<OrderResponseDto>('/orders', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),
  getOrders: () => request<OrderResponseDto[]>('/orders'),
  getOrder: (id: string) => request<OrderResponseDto>(`/orders/${id}`),
  updateOrderStatus: (id: string, status: OrderStatus) =>
    request<OrderResponseDto>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  cancelOrder: (id: string) =>
    request<OrderResponseDto>(`/orders/${id}/cancel`, { method: 'POST' }),

  // Admin & Health
  getAdminDashboard: () => request<any>('/admin/dashboard'),
  getHealth: () => request<HealthStatusDto>('/health'),
};
