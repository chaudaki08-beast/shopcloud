# Changelog

All notable changes to the **ShopCloud** platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.0-phase4] — Phase 4: Authentication & RBAC (2026-10-03)

### Added
* Self-contained authentication engine in `@shopcloud/api` with zero third-party vendor lock-in
* Customer registration endpoint (`POST /api/v1/auth/register`) with automatic email normalization, minimum 8-character password enforcement, and default `CUSTOMER` role assignment
* Secure password hashing utilizing `bcryptjs` with salt work factor of 12 for deterministic cross-platform execution
* Login endpoint (`POST /api/v1/auth/login`) with generic `INVALID_CREDENTIALS` error responses preventing email enumeration, account active status verification, and `lastLoginAt` updates
* Short-lived JWT access tokens (15-minute expiration) signed with HS256 containing minimal non-sensitive claims (`sub`, `email`, `role`, `jti`)
* High-entropy refresh tokens formatted as `<tokenId>.<secret>` with `SHA-256` hash storage in PostgreSQL
* Refresh token rotation endpoint (`POST /api/v1/auth/refresh`) with zero-trust reuse detection that immediately revokes all user sessions if a rotated or revoked token is replayed
* Session revocation and logout endpoint (`POST /api/v1/auth/logout`) and sanitized user profile endpoint (`GET /api/v1/auth/me`)
* Granular Role-Based Access Control (RBAC) and permissions engine with `RolePermission` and `Permission` relational models and 19 fine-grained permission keys
* Declarative authentication & authorization guards: `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`, and sliding-window `AuthRateLimiterGuard` (10 req/min per IP)
* Custom metadata decorators: `@Public()`, `@CurrentUser()`, `@Roles()`, and `@RequirePermissions()`
* Strict resource ownership validation ensuring customers can only inspect and modify their own carts and orders
* Security audit logging across all auth lifecycle events (`USER_REGISTERED`, `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `TOKEN_REFRESHED`, `TOKEN_REUSE_DETECTED`, `USER_LOGOUT`)
* Frontend authentication support in `@shopcloud/web` with Sign In / Register tabs in `AuthModal`, refresh token storage, and authenticated logout
* Comprehensive 81-test API test suite including dedicated `AuthService` and RBAC guard test suites with zero regressions
* Comprehensive architectural documentation in `docs/authentication/README.md` and security rationale in `docs/security/README.md`

---

## [0.3.0-phase3] — Phase 3: PostgreSQL & Migrations (2026-10-03)

### Added
* Enterprise relational PostgreSQL schema with 16 domain models: `User`, `Category`, `Product`, `ProductImage`, `InventoryMovement`, `Cart`, `CartItem`, `Order`, `OrderItem`, `OrderStatusHistory`, `Shipment`, `Payment`, `PaymentEvent`, `Coupon`, `AuditLog`, and `Notification`
* Version-controlled incremental migration history (`20261003090131_init_shopcloud_schema`) managed via Prisma Migrate
* Root-level and package-level database orchestration CLI commands: `npm run db:migrate`, `npm run db:migrate:deploy`, `npm run db:status`, `npm run db:seed`, `npm run db:reset`, and `npm run db:generate`
* Deterministic, idempotent catalog and user seeding script (`packages/database/src/seed.ts`) populating categories, tech products, primary images, initial stock inventory movements, demo role accounts (`admin`, `customer`, `inventory`), and coupons
* Zero-floating-point financial integrity across all models storing monetary values as integer paise
* Automated `@shopcloud/database` test suite verifying database connectivity, seed validation, relational navigation, transactional order placement with stock decrement, order status transitions, and foreign key constraint enforcement
* Comprehensive database architectural documentation and Mermaid ERD in `docs/database/README.md`
* Future-ready connection abstraction for zero-refactoring deployment to Google Cloud SQL

---

## [0.2.0-phase2] — Phase 2: Backend & REST APIs (2026-10-03)

### Added
* Complete Product REST API (`POST`, `GET`, `GET :id`, `PATCH`, `DELETE`) with allowlisted sorting (`name`, `price`, `createdAt`, `updatedAt`), pagination metadata envelope, and multi-parameter filtering
* Dedicated Category REST API (`POST`, `GET`, `GET :id`, `PATCH`, `DELETE`) with automated slugification, duplicate slug validation, and deletion protection for active categories
* Cart REST API (`GET`, `POST /items`, `PATCH /items/:productId`, `DELETE /items/:productId`, `DELETE`) with strict stock revalidation and zero-trust server-side financial calculations (subtotal, 18% GST, free shipping threshold)
* Order REST API (`POST`, `GET`, `GET :id`, `PATCH :id/status`, `POST :id/cancel`) with atomic inventory reservation and stock release
* Dedicated `OrderStateMachine` enforcing full e-commerce lifecycle (`CART` -> `CHECKOUT` -> `PAYMENT_PENDING` -> `PAYMENT_SUCCESS` -> `CONFIRMED` -> `PROCESSING` -> `SHIPPED` -> `OUT_FOR_DELIVERY` -> `DELIVERED`, cancellation, RMA flow) and rejecting invalid transitions with HTTP 409 Conflict (`ORDER_INVALID_STATE_TRANSITION`)
* Status transition audit logging in `AuditLog`
* Standardized error response filter (`GlobalHttpExceptionFilter`) and success response interceptor (`TransformInterceptor`)
* Interactive OpenAPI / Swagger documentation mounted at `/api/docs`
* Comprehensive 60-test automated suite covering Products, Categories, Cart, Orders, and Order State Machine matrix
* Frontend API client updated with typed functions consuming Phase 2 endpoints

---

## [0.1.0-phase1] — Phase 1: Foundation (2026-10-02)

### Added
* Monorepo workspace architecture with npm workspaces
* Shared domain contracts package (`@shopcloud/contracts`) with TypeScript enums, DTOs, and CloudEvent schemas
* Database layer (`@shopcloud/database`) with PostgreSQL Prisma schema, connection singleton, and seed script
* Core API Gateway (`@shopcloud/api`) with NestJS, health check probes (`/api/v1/health`), and modular structure
* Event consumer workers (`@shopcloud/workers`) daemon for inventory, payment, and notifications
* Customer storefront & cloud operations admin portal (`@shopcloud/web`) with React 18, Vite, and Tailwind CSS
* Local development environment with Docker Compose (PostgreSQL 16 & Google Cloud Pub/Sub emulator)
* Production multi-stage Dockerfiles for Cloud Run containerization
* Modular Terraform IaC foundation for GCP (Networking, Cloud SQL, Cloud Run, Pub/Sub, Storage, IAM, Monitoring)
* Performance benchmark load testing script (`infrastructure/k6/load-test.js`)
* GitHub Actions CI pipeline (`.github/workflows/ci.yml`)

---

## [0.0.0-architecture] — Phase 0: Architecture & Blueprint

### Added
* High-level event-driven target architecture on Google Cloud Platform
* Distributed systems resilience specifications (atomic stock reservation, idempotency, asynchronous order pipeline)
* Complete 18-phase implementation roadmap and portfolio case study blueprint
* Architecture Decision Records (ADR-0001, ADR-0002)
