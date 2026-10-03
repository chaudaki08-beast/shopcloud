# 🌐 ShopCloud REST API Specification

ShopCloud exposes a production-style, high-performance REST API gateway built with **NestJS** and **TypeScript**, versioned under `/api/v1`.

Interactive Swagger / OpenAPI UI is accessible at:
```text
http://localhost:3000/api/docs
```
OpenAPI JSON Specification:
```text
http://localhost:3000/api/docs-json
```

---

## 🎯 Global Standards

### 1. Success Response Envelope
All endpoints return a uniform JSON envelope:
```json
{
  "success": true,
  "data": { ... }
}
```

For paginated listing endpoints:
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 2. Error Response Envelope
Handled centrally by `GlobalHttpExceptionFilter`:
```json
{
  "success": false,
  "error": {
    "code": "ORDER_INVALID_STATE_TRANSITION",
    "message": "Order cannot transition from DELIVERED to PROCESSING",
    "details": []
  },
  "timestamp": "2026-10-03T08:24:42.163Z"
}
```

---

## 📦 Endpoint Catalog

### Products
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/products` | Paginated product listing with filtering and allowlisted sorting |
| `GET` | `/api/v1/products/:id` | Retrieve product by UUID or URL slug |
| `POST` | `/api/v1/products` | Create a new product (validates SKU uniqueness) |
| `PATCH`| `/api/v1/products/:id` | Update product details |
| `DELETE`| `/api/v1/products/:id` | Soft-deactivate product |

#### Query Parameters for `GET /api/v1/products`
* `page`: Page number (default: 1)
* `limit`: Items per page (default: 20, max: 50)
* `categoryId`: Filter by category UUID
* `categorySlug`: Filter by category URL slug
* `search`: Full text search on name, description, and SKU
* `minPrice`: Minimum price in currency subunits (paise)
* `maxPrice`: Maximum price in currency subunits (paise)
* `status`: `ACTIVE` or `INACTIVE`
* `inStockOnly`: `true` to filter out out-of-stock items
* `sortBy`: Allowlisted field (`name`, `price`, `createdAt`, `updatedAt`)
* `sortOrder`: `asc` or `desc`

---

### Categories
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/categories` | List all product categories |
| `GET` | `/api/v1/categories/:id` | Retrieve category by UUID or slug |
| `POST` | `/api/v1/categories` | Create category with unique slug validation |
| `PATCH`| `/api/v1/categories/:id` | Update category name, description, or parent |
| `DELETE`| `/api/v1/categories/:id` | Delete category (rejected if associated products exist) |

---

### Cart
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/cart` | Get current cart with server-side calculated totals |
| `POST` | `/api/v1/cart/items` | Add product to cart (validates active stock) |
| `PATCH`| `/api/v1/cart/items/:productId` | Update item quantity (revalidates stock) |
| `DELETE`| `/api/v1/cart/items/:productId` | Remove item from cart |
| `DELETE`| `/api/v1/cart` | Clear entire cart |

#### Authoritative Server-Side Calculations
The client never supplies financial numbers. The server calculates:
1. **Subtotal**: $\sum (\text{unitPrice} \times \text{quantity})$
2. **Discount**: $\sum (\text{round}(\text{unitPrice} \times \text{discountPercentage} / 100) \times \text{quantity})$
3. **Discounted Subtotal**: $\text{subtotal} - \text{discount}$
4. **GST Tax (18%)**: $\text{round}(\text{discountedSubtotal} \times 0.18)$
5. **Shipping**: Free if discounted subtotal > ₹50,000; otherwise standard ₹499 (49,900 paise)
6. **Grand Total**: $\text{discountedSubtotal} + \text{tax} + \text{shipping}$

---

### Orders
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/orders` | Create order from cart (atomic stock reservation) |
| `GET` | `/api/v1/orders` | List user orders |
| `GET` | `/api/v1/orders/:id` | Retrieve order details by ID |
| `PATCH`| `/api/v1/orders/:id/status` | Advance order status through strict state machine |
| `POST` | `/api/v1/orders/:id/cancel` | Cancel order and release reserved stock |

---

### Health Probes (GCP Cloud Run)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Readiness probe verifying DB, Pub/Sub, Storage connectivity |
| `GET` | `/api/v1/health/liveness` | Lightweight HTTP 200 liveness probe |
