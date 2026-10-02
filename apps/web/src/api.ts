import {
  ProductDto,
  CategoryDto,
  PaginatedResult,
  CartSummaryDto,
  OrderResponseDto,
  HealthStatusDto,
  CreateOrderDto,
  AuthResponseDto,
  LoginRequestDto,
  RegisterRequestDto,
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
    throw new Error(errorBody.message || `Request failed with status ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (dto: LoginRequestDto) => request<AuthResponseDto>('/auth/login', { method: 'POST', body: JSON.stringify(dto) }),
  register: (dto: RegisterRequestDto) => request<AuthResponseDto>('/auth/register', { method: 'POST', body: JSON.stringify(dto) }),
  getProfile: () => request<any>('/auth/me'),

  // Products & Categories
  getProducts: (params?: { categorySlug?: string; search?: string; page?: number; sortBy?: string }) => {
    const query = new URLSearchParams();
    if (params?.categorySlug) query.append('categorySlug', params.categorySlug);
    if (params?.search) query.append('search', params.search);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.sortBy) query.append('sortBy', params.sortBy);
    return request<PaginatedResult<ProductDto>>(`/products?${query.toString()}`);
  },
  getCategories: () => request<CategoryDto[]>('/products/categories'),
  getProduct: (slug: string) => request<ProductDto>(`/products/${slug}`),

  // Cart
  getCart: () => request<CartSummaryDto>('/cart'),
  addToCart: (productId: string, quantity = 1) =>
    request<CartSummaryDto>('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    }),
  updateCartQuantity: (productId: string, quantity: number) =>
    request<CartSummaryDto>(`/cart/items/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    }),
  removeFromCart: (productId: string) =>
    request<CartSummaryDto>(`/cart/items/${productId}`, { method: 'DELETE' }),

  // Orders
  createOrder: (dto: CreateOrderDto) =>
    request<OrderResponseDto>('/orders', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),
  getOrders: () => request<OrderResponseDto[]>('/orders'),
  getOrder: (id: string) => request<OrderResponseDto>(`/orders/${id}`),

  // Admin & Health
  getAdminDashboard: () => request<any>('/admin/dashboard'),
  getHealth: () => request<HealthStatusDto>('/health'),
};
