export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  STORE_ADMIN = 'STORE_ADMIN',
  INVENTORY_MANAGER = 'INVENTORY_MANAGER',
  CUSTOMER_SUPPORT = 'CUSTOMER_SUPPORT',
  CUSTOMER = 'CUSTOMER',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export enum AppPermission {
  PRODUCTS_READ = 'products:read',
  PRODUCTS_CREATE = 'products:create',
  PRODUCTS_UPDATE = 'products:update',
  PRODUCTS_DELETE = 'products:delete',
  CATEGORIES_READ = 'categories:read',
  CATEGORIES_CREATE = 'categories:create',
  CATEGORIES_UPDATE = 'categories:update',
  CATEGORIES_DELETE = 'categories:delete',
  CART_READ = 'cart:read',
  CART_UPDATE = 'cart:update',
  ORDERS_READ = 'orders:read',
  ORDERS_CREATE = 'orders:create',
  ORDERS_UPDATE = 'orders:update',
  ORDERS_CANCEL = 'orders:cancel',
  INVENTORY_READ = 'inventory:read',
  INVENTORY_UPDATE = 'inventory:update',
  USERS_READ = 'users:read',
  USERS_UPDATE = 'users:update',
  ADMIN_MANAGE = 'admin:manage',
}

export enum OrderStatus {
  CART = 'CART',
  CHECKOUT = 'CHECKOUT',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  RETURN_REQUESTED = 'RETURN_REQUESTED',
  RETURN_APPROVED = 'RETURN_APPROVED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum PubSubTopic {
  ORDER_CREATED = 'order-created',
  PAYMENT_COMPLETED = 'payment-completed',
  PAYMENT_FAILED = 'payment-failed',
  INVENTORY_UPDATED = 'inventory-updated',
  ORDER_SHIPPED = 'order-shipped',
  ORDER_DELIVERED = 'order-delivered',
  NOTIFICATION_REQUESTED = 'notification-requested',
}
