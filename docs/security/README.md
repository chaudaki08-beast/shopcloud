# ShopCloud — Security & RBAC Specifications

This document outlines the security architecture, cryptographic design choices, and authorization mechanisms implemented across the ShopCloud platform.

---

## 1. Password Hashing & Security Decisions

### 1.1 Algorithm Selection: Bcryptjs (Salt Factor 12)
* **Design Decision:** The system utilizes `bcryptjs` with a work factor (salt rounds) of `12`.
* **Rationale:**
  * In a multi-environment microservice stack (local developer machines on Windows, CI/CD pipelines, Docker containerized services, and Google Cloud Run containers), native C/C++ bindings (such as standard native `argon2` or native `bcrypt`) introduce platform-dependent binary compatibility hurdles (`node-gyp`, Python dependencies, and OS-specific glibc/musl bindings).
  * `bcryptjs` provides 100% deterministic pure JavaScript execution while maintaining the proven adaptive Blowfish key-derivation function.
  * Work factor 12 enforces ~250–350ms of computational hashing overhead per attempt, creating an effective deterrent against offline brute-force and dictionary attacks without overloading server CPUs under legitimate load.

### 1.2 Password Policy
* Minimum password length: **8 characters**.
* Passwords are never logged in application logs, database queries, or audit event details.
* Passwords are never returned in any API response or DTO.

### 1.3 Anti-Account Enumeration
* During login (`POST /api/v1/auth/login`), any failure—including:
  1. Non-existent email address
  2. Incorrect password
  3. Disabled or inactive account status
* Returns the identical, ambiguous error response:
  ```json
  {
    "statusCode": 401,
    "message": "INVALID_CREDENTIALS",
    "error": "Unauthorized"
  }
  ```
* This prevents automated attackers from probing which emails exist within the ShopCloud database.

---

## 2. Refresh Token Rotation & Session Hardening

Refresh tokens provide continuous authenticated sessions without requiring persistent long-lived access tokens.

### 2.1 Cryptographic Token Structure
* Each refresh token is composed of two discrete components separated by a period:
  ```text
  <tokenId>.<secret>
  ```
* `tokenId`: A standard UUIDv4 generated server-side.
* `secret`: A cryptographically secure 256-bit random hex string (64 characters) generated via `crypto.randomBytes(32)`.

### 2.2 Storage Security
* **Raw secrets are never stored in the database.**
* When a refresh token is issued, only the cryptographic `SHA-256` hash of the secret is persisted in the PostgreSQL `RefreshToken` table along with the `tokenId`, `userId`, and `expiresAt` (7-day default duration).

### 2.3 Rotation & Reuse Detection (Zero Trust)
* Whenever a refresh token is presented to `/api/v1/auth/refresh`:
  1. The server locates the `RefreshToken` record matching `tokenId`.
  2. If the token record is marked as **revoked** or has already been replaced (`replacedByTokenId != null`):
     * **A token replay attack is detected.**
     * The system **instantly invalidates all active sessions for that user** (`revokedAt = NOW()`).
     * An audit event (`TOKEN_REUSE_DETECTED`) is written.
     * The request is rejected with `401 Unauthorized`.
  3. If valid, the current token is atomically marked revoked with its `replacedByTokenId` pointer set to a freshly generated replacement token.

---

## 3. Role-Based Access Control (RBAC) & Permissions Matrix

ShopCloud combines role inheritance with granular, permission-based authorization.

### 3.1 Roles Definition
| Role | Identifier | Intended Audience |
| :--- | :--- | :--- |
| **Super Admin** | `SUPER_ADMIN` | Platform engineers, root system operators (bypasses all permission checks) |
| **Store Admin** | `STORE_ADMIN` | E-commerce operations managers managing catalogs, categories, and promotions |
| **Inventory Manager** | `INVENTORY_MANAGER` | Warehouse personnel managing physical inventory and stock adjustments |
| **Customer Support** | `CUSTOMER_SUPPORT` | Support staff handling orders, returns, and customer inquiries |
| **Customer** | `CUSTOMER` | Registered storefront consumers |

---

### 3.2 Granular Permissions Matrix

| Permission Key | Description | Super Admin | Store Admin | Inventory Mgr | Customer Support | Customer | Public |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `products:read` | View catalog products | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `products:create` | Create new product | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `products:update` | Edit product details | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `products:delete` | Soft-delete product | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `categories:read` | Browse categories | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `categories:create`| Add category | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `categories:update`| Edit category | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `categories:delete`| Delete category | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `cart:read` | View shopping cart | ✅ | ❌ | ❌ | ❌ | ✅ (Owner) | ❌ |
| `cart:update` | Add/update cart items | ✅ | ❌ | ❌ | ❌ | ✅ (Owner) | ❌ |
| `orders:read` | View orders | ✅ | ✅ | ❌ | ✅ | ✅ (Owner) | ❌ |
| `orders:create` | Submit new order | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `orders:update` | Transition order status | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `orders:cancel` | Cancel order | ✅ | ✅ | ❌ | ✅ | ✅ (Owner) | ❌ |
| `inventory:read` | View warehouse stock | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `inventory:update`| Adjust stock quantities| ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `users:read` | Inspect user accounts | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `users:update` | Modify user accounts | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `admin:manage` | Root administrative actions| ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 4. API Guards & Architecture

Authorization is enforced declaratively using NestJS Guards and custom decorators:

```ts
@Controller('products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsController {
  @Public()
  @Get()
  findAll() { ... }

  @Post()
  @RequirePermissions(AppPermission.PRODUCTS_CREATE)
  create(@Body() dto: CreateProductDto) { ... }
}
```

* `@Public()`: Explicitly allows unauthenticated access while still establishing user context if a valid token is provided.
* `JwtAuthGuard`: Validates JWT token signature and expiration, checking `AccountStatus !== DISABLED`.
* `PermissionsGuard`: Reads required permissions and verifies against user claims or dynamic database-backed permissions.
* `AuthRateLimiterGuard`: In-memory sliding-window rate limiter restricting authentication attempts to 10 requests per minute per IP.
