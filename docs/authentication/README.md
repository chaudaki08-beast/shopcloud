# ShopCloud — Authentication & Authorization Architecture

ShopCloud employs an enterprise-grade, cloud-native Authentication and Role-Based Access Control (RBAC) foundation designed specifically for high-throughput e-commerce operations.

---

## 1. Authentication Overview

The authentication system is completely self-contained within the ShopCloud NestJS backend and PostgreSQL database, without third-party vendor lock-in (such as Auth0, Clerk, or Firebase Auth).

### Core Components
* **Password Hashing:** `bcryptjs` with salt work factor of 12.
* **Access Tokens:** Short-lived JSON Web Tokens (JWT) with 15-minute expiration window.
* **Refresh Tokens:** Opaque, high-entropy tokens formatted as `<tokenId>.<secret>`. Token hashes (`SHA-256`) are stored in PostgreSQL; raw secrets are never persisted.
* **Token Rotation & Reuse Detection:** Immediate rotation on every refresh request. Reuse of an already-rotated or revoked token triggers immediate invalidation of all user sessions.
* **Account Status Enforcement:** Checks `AccountStatus` (`ACTIVE` vs `DISABLED`) on both credential authentication and token refresh operations.
* **Anti-Enumeration Protections:** Generic `INVALID_CREDENTIALS` error messages prevent discovery of registered emails.
* **Security Audit Trail:** Comprehensive recording in `AuditLog` of logins, failures, registrations, token refreshes, reuse attacks, and logouts.
* **Endpoint Rate Limiting:** Sensitive endpoints (`/auth/login`, `/auth/register`, `/auth/refresh`) are capped at 10 requests per minute per IP address.

---

## 2. Authentication Flows & Sequence Diagrams

### 2.1 User Registration Flow
```mermaid
sequenceDiagram
    autonumber
    actor Client as Storefront Client
    participant RateLimiter as AuthRateLimiterGuard
    participant Controller as AuthController
    participant Service as AuthService
    participant DB as PostgreSQL (Prisma)

    Client->>RateLimiter: POST /api/v1/auth/register (email, password, firstName, lastName)
    RateLimiter->>Controller: Allow (within rate limit)
    Controller->>Service: register(dto)
    Service->>Service: Normalize email (lowercase, trim)
    Service->>Service: Validate password policy (min 8 chars)
    Service->>DB: Check existing user by email
    alt User Already Exists
        Service-->>Client: 409 ConflictException ("An account with this email already exists")
    else New User
        Service->>Service: Hash password with bcrypt (salt 12)
        Service->>DB: Create User (Role: CUSTOMER, Status: ACTIVE)
        Service->>DB: Create RefreshToken session (SHA-256 hash)
        Service->>DB: Insert AuditLog ("USER_REGISTERED")
        Service->>Service: Sign Access Token JWT (15m expiry)
        Service-->>Client: 201 Created (UserDto, AccessToken, RefreshToken)
    end
```

---

### 2.2 User Login Flow & Anti-Enumeration
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / User
    participant RateLimiter as AuthRateLimiterGuard
    participant Service as AuthService
    participant DB as PostgreSQL (Prisma)

    Client->>RateLimiter: POST /api/v1/auth/login (email, password)
    RateLimiter->>Service: login(dto)
    Service->>Service: Normalize email
    Service->>DB: Query user by email
    alt Email Not Found or Password Mismatch or Account Disabled
        Service->>DB: Insert AuditLog ("LOGIN_FAILURE", reason)
        Service-->>Client: 401 Unauthorized ("INVALID_CREDENTIALS")
    else Credentials Valid & Account Active
        Service->>DB: Update lastLoginAt timestamp
        Service->>DB: Insert AuditLog ("LOGIN_SUCCESS")
        Service->>DB: Create RefreshToken (SHA-256 hash, 7d expiry)
        Service->>Service: Sign JWT Access Token
        Service-->>Client: 200 OK (UserDto, AccessToken, RefreshToken, expiresIn: 900)
    end
```

---

### 2.3 Refresh Token Rotation & Reuse Detection Flow
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client
    participant Service as AuthService
    participant DB as PostgreSQL (Prisma)

    Client->>Service: POST /api/v1/auth/refresh (refreshToken: "<tokenId>.<secret>")
    Service->>DB: Query RefreshToken by tokenId (include User)
    alt Record Not Found
        Service-->>Client: 401 Unauthorized ("INVALID_REFRESH_TOKEN")
    else Record Already Revoked or Rotated (replacedByTokenId != null)
        Note over Service,DB: AUTOMATIC REUSE DETECTION TRIGGERED
        Service->>DB: Invalidate ALL active RefreshTokens for user
        Service->>DB: Insert AuditLog ("TOKEN_REUSE_DETECTED")
        Service-->>Client: 401 Unauthorized ("TOKEN_REUSE_DETECTED")
    else Hash Verification Fails or Expired or User Disabled
        Service-->>Client: 401 Unauthorized (Specific error code)
    else Token Valid
        Service->>DB: Transaction: Revoke old token & link replacedByTokenId
        Service->>DB: Transaction: Insert new token pair (new tokenId, SHA-256 hash)
        Service->>DB: Insert AuditLog ("TOKEN_REFRESHED")
        Service->>Service: Sign new Access Token JWT (15m expiry)
        Service-->>Client: 200 OK (New AccessToken, New RefreshToken, expiresIn: 900)
    end
```

---

## 3. JWT Claims Specification

Access tokens are encoded as JSON Web Tokens signed with HS256:

```json
{
  "sub": "c1f7a0e2-4521-4f1b-9e12-892bbd8e0341",
  "email": "customer@shopcloud.dev",
  "role": "CUSTOMER",
  "jti": "9f323a6c-9be8-46b0-9bf7-28d8b671a533",
  "iat": 1759516800,
  "exp": 1759517700
}
```

* `sub`: Unique PostgreSQL UUID of the user.
* `email`: Normalized user email address.
* `role`: User role enum (`CUSTOMER`, `STORE_ADMIN`, etc.).
* `jti`: Unique token identifier to mitigate replay vulnerability.
* `exp`: Expiration time in seconds (strictly 15 minutes).

---

## 4. Resource Ownership Enforcement

Resource-level authorization ensures users can only inspect or modify their own data:
* **Cart Operations (`/api/v1/cart/**`):** Binds requests directly to `@CurrentUser().id`. A customer cannot access or tamper with another customer's shopping cart.
* **Order Management (`/api/v1/orders/**`):** `GET /orders` and `GET /orders/:id` verify that `order.userId === currentUser.id`, unless the authenticated user holds administrative permissions (`orders:update` or `SUPER_ADMIN`).
