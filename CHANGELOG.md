# Changelog

All notable changes to the **ShopCloud** platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.9.0-phase9] — Phase 9: Google Cloud Storage & Object Storage (2026-10-05)

### Added
* Production Google Cloud Storage (GCS) bucket `shopcloud-media-24903284190` in `asia-south1` with `STANDARD` storage class, Uniform Bucket-Level Access (UBLA), and Public Access Prevention (`enforced`).
* GCS lifecycle configuration rule to automatically abort incomplete multipart uploads after 7 days (`AbortIncompleteMultipartUpload`).
* Least-privilege IAM binding on the bucket granting `roles/storage.objectUser` to the Cloud Run runtime service account `shopcloud-api-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com`.
* Prisma schema migration `20261005102731_add_product_image_storage_metadata` deployed to Cloud SQL, adding `storageKey`, `mimeType`, and `fileSize` columns with indexing on `ProductImage`.
* `StorageService` (`apps/api/src/modules/storage`) wrapping `@google-cloud/storage` with multi-tier validation: 5 MB size limit, strict MIME whitelisting (`image/jpeg`, `image/png`, `image/webp`), and binary magic byte signature verification to defeat file extension / header spoofing.
* Deterministic collision-free object naming strategy: `products/{productId}/{uuid}.{ext}` with product ID path sanitization.
* REST API endpoints for product image operations:
  - `POST /api/v1/products/:id/images`: Uploads image, verifies magic bytes, streams to GCS, and saves metadata in PostgreSQL (protected by `SUPER_ADMIN`, `STORE_ADMIN`, `INVENTORY_MANAGER`).
  - `GET /api/v1/products/:id/images`: Retrieves all product image metadata.
  - `GET /api/v1/products/:id/images/:imageId`: Retrieves single image metadata.
  - `GET /api/v1/products/:id/images/:imageId/file`: High-performance binary proxy stream with Content-Type and Cache-Control headers.
  - `GET /api/v1/products/:id/images/:imageId/signed-url`: Generates 15-minute time-limited Google Cloud V4 signed URL with proxy stream fallback.
  - `PATCH /api/v1/products/:id/images/:imageId/primary`: Atomically sets primary product image within an ACID transaction.
  - `DELETE /api/v1/products/:id/images/:imageId`: Atomically deletes metadata from database and purges object from GCS bucket.
* Offline in-memory buffer fallback in `StorageService` enabling 100% deterministic test execution without internet connectivity or cloud credentials during unit testing (`process.env.JEST_WORKER_ID`).
* 21 new unit tests in `apps/api` (`storage.service.spec.ts` and `products-images.spec.ts`).
* Real live E2E validation against Cloud Run, Cloud SQL, and GCS (31/31 tests passing, 0 failures).
* Comprehensive cloud storage documentation in `docs/gcp/cloud-storage.md` and `docs/gcp/storage-security.md`.

---

## [0.8.0-phase8] — Phase 8: Cloud SQL & Production Database (2026-10-05)

### Added
* Managed Google Cloud SQL PostgreSQL 16 Enterprise instance `shopcloud-postgres` in `asia-south1-c` (`db-custom-1-3840`, 1 vCPU, 3.75 GB RAM, 10 GB SSD with auto-increase, deletion protection, daily backups).
* Application database `shopcloud` with dedicated non-superuser `shopcloud_app` following least-privilege principles.
* Production Prisma migrations executed via `prisma migrate deploy` over secure IAM-authenticated Cloud SQL Auth Proxy v2 (zero pending migrations).
* Deterministic safe production seed (`packages/database/src/seed-prod.ts`) initializing categories, fine-grained permissions, role-permission matrices, initial products, images, and welcome coupons with strictly ZERO insecure demo credentials.
* Google Secret Manager integration for `shopcloud-dev-database-url` (version 2) with bounded connection pooling (`connection_limit=10&pool_timeout=20`).
* Project IAM binding granting `roles/cloudsql.client` to `shopcloud-api-runtime` service account.
* Cloud Run `shopcloud-api` connected to Cloud SQL via native Unix domain socket (`--add-cloudsql-instances`) at revision `shopcloud-api-00006-b95`.
* Comprehensive automated baseline backup created and verified in Cloud SQL (Backup ID `1791191580964`).
* Full E2E smoke tests and transaction rollback validation passing against live Cloud Run and Cloud SQL (39/39 smoke tests passed; 9/9 constraint and ACID rollback tests passed).
* Comprehensive GCP documentation in `docs/gcp/cloud-sql.md` and `docs/gcp/database-production.md`.

### Fixed
* Fixed root Jest test execution in `apps/api` by loading environment variables with `dotenv -e ../../.env`.
* Fixed local development PostgreSQL configuration to bind explicitly to port 5433, avoiding conflict with system-level port 5432.
* Populated Secret Manager container `shopcloud-dev-jwt-refresh-secret` with high-entropy cryptographic secret.

---

## [0.7.0-phase7] — Phase 7: Cloud Run Deployment (2026-10-04)

### Added
* Cloud Run services `shopcloud-api` and `shopcloud-web` in `asia-south1` (scale to zero, max 2 instances, request-based CPU, HTTP startup/liveness probes), deployed by image digest
* `Build & Push Images` workflow: builds API and web images in GitHub Actions and pushes them to Artifact Registry through Workload Identity Federation (`phase7-<sha>` and full-SHA tags, no `latest`); deployment stays manual until Phase 12
* `shopcloud-web-runtime` service account with no roles; API runs as `shopcloud-api-runtime`
* `JWT_ACCESS_SECRET` served from Secret Manager (`shopcloud-dev-jwt-access-secret:2`, value generated directly into Secret Manager)
* `docs/gcp/cloud-run.md` (services, URLs, images, IAM, secrets, probes, scaling, rollback, limitations) and Phase 7 validation results

### Fixed
* API image crashed on start (`Cannot find module 'dotenv'`): runtime stages now copy workspace-local `node_modules`; CI smoke-tests the API image in production mode without a database
* `/api/v1/health` reported every dependency "healthy" without checking; it now runs a real `SELECT 1` with latency, marks unprobed dependencies as such, and returns 503 only when PostgreSQL is down
* Admin dashboard health cards render reported status instead of hardcoded green values
* README CI badge pointed at a placeholder repository

### Deferred
* Database-backed functionality (catalog, sign-in, cart, orders, admin) returns `503 DATABASE_UNAVAILABLE` until Cloud SQL (Phase 8)
* Worker service (Phase 10, Pub/Sub push)

---

## [0.6.0-phase6] — Phase 6: GCP Foundation & Platform Baseline (2026-10-04)

### Added
* GCP project `project-c3f386b1-6c37-468d-8ee` ("ShopCloud Dev", region `asia-south1`) with billing, labels and a ₹500/month budget alert
* Foundation APIs only: IAM, IAM Credentials, STS, Resource Manager, Artifact Registry, Secret Manager, Cloud Billing, Budgets (Cloud Run, Cloud SQL, Pub/Sub and GKE deferred)
* Artifact Registry Docker repository `shopcloud` with cleanup policy (keep 10 latest, delete untagged > 7 d, delete > 30 d)
* Service accounts `shopcloud-api-runtime`, `shopcloud-worker-runtime`, `shopcloud-github-deployer` with no project-level roles; resource-scoped grants only
* Workload Identity Federation (`shopcloud-github-pool` / `github-actions`) restricted to this repository's numeric IDs — no service-account keys
* Secret Manager containers (no values) with per-secret accessor bindings
* `GCP WIF Check` workflow proving keyless authentication and deployer least privilege (200 / 403 / 403)
* GCP documentation in `docs/gcp/` (foundation, IAM, security, validation)

### CI/CD
* CI fixed after failing since Phase 1 (`@shopcloud/database` was never built); now runs migrations, seed and the full test suite against PostgreSQL, builds all images and smoke-tests containers on `PORT=8080`
* CD runs only after successful CI on `main` and skips deployment with a clear notice until GCP secrets are configured

### Security
* Production (`NODE_ENV=production`) no longer accepts the hardcoded demo logins or demo JWT subjects, no longer issues tokens when refresh-token storage fails, and no longer serves in-memory demo data when PostgreSQL fails (503 instead)
* Cart and order identity comes only from the verified JWT; the client `x-user-id` header is no longer trusted
* API refuses to boot in production without `JWT_ACCESS_SECRET`; CORS is an explicit `CORS_ORIGIN` allowlist (`*` rejected in production)
* Auth rate limiting keys on the proxy-appended client address (`TRUST_PROXY_HOPS`) instead of the client-controlled `X-Forwarded-For` entry

### Fixed (Cloud Run readiness)
* Worker listens on Cloud Run's `PORT`; supports Pub/Sub push delivery (`PUBSUB_DELIVERY=push`) with OIDC verification; graceful shutdown closes the subscription and Prisma
* Auth rate limits are shared across instances via a PostgreSQL fixed-window counter (migration `add_auth_rate_limits`)
* Web nginx config is an env template (`PORT`, `API_UPSTREAM`) with per-request DNS resolution, so it starts on Cloud Run
* API disconnects Prisma on shutdown

---

## [0.5.0-phase5] — Phase 5: Docker & Containerization (2026-10-04)

### Added
* Production-grade multi-stage Dockerfiles (`Dockerfile.api`, `Dockerfile.web`, `Dockerfile.worker`) utilizing `node:22-bookworm-slim` for Debian glibc/Prisma stability and `nginx:alpine` for the web layer
* Unified Docker Compose topology (`compose.yaml` and `docker-compose.yml`) orchestrating `shopcloud-postgres`, `shopcloud-api`, `shopcloud-workers`, and `shopcloud-web` on a dedicated bridge network (`shopcloud-network`)
* Service dependency graph enforcing logical container readiness via healthcheck dependencies (`service_healthy`) across all services
* Zero-dependency HTTP health checks on API (`/api/v1/health/liveness`), Workers (`/health`), and Web (`/health`)
* Lightweight HTTP health probe server integrated into `@shopcloud/workers` on port 8081 for Cloud Run and Compose liveness probes
* Security-hardened container execution running as unprivileged non-root user (`USER node`, UID 1000) with devDependencies pruned (`npm prune --omit=dev`)
* Comprehensive root `.dockerignore` eliminating repository bloat, version control metadata, and local database artifacts from image build contexts
* Docker environment configuration template (`.env.docker.example`) documenting all runtime environment variables with zero committed secrets
* Separated database migration deployment profile (`db-migrate` and `db-seed`) preventing destructive or accidental migration runs on API container startup
* Enhanced `apps/web/nginx.conf` with security headers, Gzip compression, static asset caching headers, and SPA client-side routing fallback
* Comprehensive containerization documentation in `docs/docker/README.md` and GCP Cloud Run runtime compatibility review in `docs/docker/cloud-run-compatibility.md`

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
