# Changelog

All notable changes to the **ShopCloud** platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — Phase 18: Final Cloud Audit, Security Verification & Project Completion (2026-10-16)

### Added
* Comprehensive Platform & Cloud Architecture Audit:
  - Evidence-based multi-phase audit of Phases 0–17 across monorepo applications, infrastructure, CI/CD, security posture, and cloud resources.
  - Verification of core distributed systems invariants: integer-minor-unit money handling (paise/cents), ACID stock decrement and compensation, non-negative inventory enforcement, transactionally atomic outbox logging, and idempotent event deduplication (`ProcessedEvent` unique constraint).
  - Defensive security review covering authentication, bcrypt cost factor (12 rounds), JWT rotation, least privilege IAM, WIF keyless authentication, input sanitization, rate limiting with IP spoofing defenses (`TRUST_PROXY_HOPS`), and magic byte upload validation.
  - Zero Plaintext Leakage audit verified across all git history, configuration files, and Kubernetes templates (`ci-security-check.js`).
* Automated Quality & Multi-Layer Test Verification:
  - 319 automated tests and validation checks passed across all monorepo workspaces and infrastructure scripts.
  - Monorepo compilation verified (`npm run build` across `@shopcloud/api`, `@shopcloud/web`, `@shopcloud/workers`, `@shopcloud/contracts`, and `@shopcloud/database`).
  - Strict typecheck passed with zero errors (`tsc --noEmit`).
  - Terraform quality and security check passed (`terraform fmt -check`, `terraform validate`).
  - Kubernetes manifests validated with 99 automated checks conforming to Pod Security Standards Restricted profile.
  - k6 performance scenarios validated across 6 critical user flows.
* Portfolio & Demonstration Showcase:
  - Consolidated and refreshed root `README.md` with modern architecture diagrams, verified test badges, real-world deployment links, and honest environment distinctions.
  - Comprehensive Final Audit Report published as permanent portfolio artifact.
* Zero-Cost GCP Policy Adherence ($0 / ₹0 Avoidable Spend):
  - Cloud SQL instance verified in stopped state (`activationPolicy: NEVER`).
  - GKE API kept disabled (`container.googleapis.com`); zero billable clusters created.
  - Total cumulative project spend retained at ₹0 / $0 avoidable spend.

---

## [1.7.0-phase17] — Phase 17: GKE Migration & Kubernetes Readiness (2026-10-16)

### Added
* Declarative Kubernetes Infrastructure (`infra/kubernetes/`):
  - Base manifests complying with Pod Security Standards (PSS) **Restricted** profile (`namespace.yaml`).
  - Core ConfigMap (`configmap.yaml`) and clean Secret schema template (`secret.yaml`) with zero plaintext or committed production credentials.
  - Workload Deployments with non-root security context (`runAsUser: 1000`), dropped Linux capabilities (`ALL`), read-only root filesystems, and rolling update strategies:
    * `shopcloud-api`: 2 replicas, probes (`/api/v1/health/liveness`, `/readiness`), resource requests/limits (100m/500m CPU, 128Mi/384Mi RAM), terminationGracePeriodSeconds: 30.
    * `shopcloud-web`: 2 replicas, probes (`/health`), resource requests/limits (50m/200m CPU, 32Mi/64Mi RAM), Nginx temp cache mounts.
    * `shopcloud-inventory-worker`: 1 replica, Pub/Sub pull mode (`shopcloud-inventory-sub`), health probes (port 8081).
    * `shopcloud-notification-worker`: 1 replica, Pub/Sub pull mode (`shopcloud-notification-sub`), health probes (port 8081).
  - Internal ClusterIP Services for API (port 3000) and Web (port 80).
  - Ingress configuration routing `/api` to API and `/` to Web frontend (`ingress.yaml`).
  - Autoscaling & Reliability:
    * HorizontalPodAutoscalers (`hpa-api.yaml`, `hpa-web.yaml`) with stabilization windows and bounded scale limits.
    * PodDisruptionBudgets (`pdb-api.yaml`, `pdb-web.yaml`) enforcing `minAvailable: 1`.
    * Namespace ResourceQuota (`resource-quota.yaml`) and LimitRange (`limit-range.yaml`).
* Kustomize Environments Hierarchy:
  - `infra/kubernetes/overlays/local/`: Single-replica minimal dev overlay with mock configs, local image tags, and disposable local credentials.
  - `infra/kubernetes/overlays/staging/`: GKE staging overlay configuring Workload Identity ServiceAccounts (`shopcloud-api-ksa`, `shopcloud-worker-ksa`) and Cloud SQL Auth Proxy v2 sidecar container for private database access.
* Kubernetes Static Schema & Security Linter (`scripts/validate-k8s-manifests.js`):
  - 99 automated checks verifying YAML syntax, Kustomize resource references, PSS restricted security contexts, resource requests/limits, probes, and secret cleanliness.
  - Added npm script `test:k8s:validate`.
* CI/CD Quality Automation (`.github/workflows/ci.yml`):
  - Integrated `Validate Kubernetes Manifests, Schemas & Security` gate running static linter, `kubectl kustomize` for base and overlays, and `kubectl apply --dry-run=client`.
* Terraform GKE Module (`infrastructure/terraform/modules/gke/`):
  - Modular GKE Autopilot resource definition with Workload Identity and private cluster networking.
  - Guarded by `enable_gke = false` by default, ensuring 0 resources are planned or provisioned in compliance with the zero-cost GCP policy.
* Comprehensive Kubernetes Documentation Suite (`docs/kubernetes/`):
  - `architecture.md`: Target workload topology, network flows, and service mesh readiness.
  - `local-development.md`: Local cluster setup guide (Minikube / Kind), troubleshooting, and honest reporting of local tool status.
  - `security.md`: PSS Restricted profile, Workload Identity Federation for GKE, and Secret Manager integration.
  - `migration-and-rollback.md`: Staged canary migration plan from Cloud Run to GKE, instant rollback mechanisms, and Go/No-Go criteria.
  - `cost-analysis.md`: Detailed official pricing analysis comparing Cloud Run ($0/mo idle) vs GKE Autopilot ($59/mo) vs GKE Standard ($74/mo), recommending retention of Cloud Run as primary deployment.
* Zero-Cost GCP Policy Compliance ($0 / ₹0 avoidable spend):
  - Cloud SQL instance kept in stopped state (`NEVER`).
  - GKE API kept disabled (`container.googleapis.com`); no live cluster created or billed. Total spend: ₹0 / $0.

---

## [1.6.0-phase16] — Phase 16: Reliability, Resilience & Failure Recovery (2026-10-16)

### Added
* Distributed Resilience & Retry Utilities (`@shopcloud/contracts`):
  - `withRetry` bounded execution engine with per-attempt timeouts, `isIdempotent` guard, and customizable `onRetry` hooks.
  - Backoff calculation with Full Jitter and Equal Jitter (`calculateBackoff`) to eliminate thundering herd retry storms.
  - Granular transient error classification (`isTransientError`) covering network error codes (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`), transient HTTP statuses (429, 500, 502, 503, 504), and PostgreSQL deadlock/serialization codes (40P01, 40001).
  - Production-gated safe `FaultInjector` supporting synthetic latency, transient errors, and permanent faults (strictly disabled in `production`).
  - Unit test suite `packages/contracts/test/resilience.test.ts` (16 tests, 100% pass).
* Transactional Outbox Crash Recovery & Jittered Backoff (`apps/api/src/modules/events/outbox.service.ts`):
  - Added `recoverStaleProcessing` sweeper to recover orphaned events left in `PROCESSING` status (> 5 minutes) caused by container restarts.
  - Upgraded publication retry backoff from deterministic to full jitter.
  - Added simulated fault injection hook for testing Pub/Sub failure scenarios.
  - Unit test suite `apps/api/src/modules/events/outbox.service.spec.ts` (6 tests, 100% pass).
* Concurrency, Inventory & State Machine Invariants (`apps/api/src/modules/orders/`):
  - Strengthened `createOrder` stock reservation to prevent overselling on concurrent checkout races.
  - Re-throw `BadRequestException` across database transaction catch blocks to prevent fallback masking of invalid requests.
  - Unit test suite `apps/api/src/modules/orders/orders-resilience.spec.ts` (6 tests, 100% pass).
* Payments & Webhook Resilience (`apps/api/src/modules/payments/`):
  - Handled late payment webhook capture on cancelled orders: preserves terminal `CANCELLED` state, writes audit log (`PAYMENT_RECEIVED_ON_CANCELLED_ORDER`), records outbox reconciliation event (`payment.reconciliation.required.v1`), records processed event marker, and returns HTTP 200 without failing or triggering endless gateway retries.
  - Normalized webhook event mappings in `test-payment.adapter.ts`.
  - Added event definition `PAYMENT_RECONCILIATION_REQUIRED_V1` and payload in `@shopcloud/contracts`.
  - Unit test suite `apps/api/src/modules/payments/payments-resilience.spec.ts` (5 tests, 100% pass).
* Worker Lifecycle & Graceful Draining (`apps/workers/`):
  - Implemented `WorkerLifecycle` class tracking in-flight asynchronous tasks.
  - Configured SIGTERM/SIGINT shutdown handler with 10-second bounded draining, returning HTTP 503 on `/healthz` during draining to shed incoming Cloud Run traffic.
  - Unit test suite `apps/workers/test/worker-resilience.test.ts` (4 tests, 100% pass).
* Comprehensive Reliability Runbooks Suite (`docs/reliability/`):
  - `failure-matrix.md`: 12 cataloged failure scenarios across database, outbox, workers, payments, and network layers.
  - `retry-and-timeout-policy.md`: Error taxonomy, jitter models, and timeout guidelines.
  - `event-recovery.md`: Transactional outbox recovery, stale sweeper mechanics, and consumer idempotency ledger.
  - `payment-reconciliation.md`: Late webhook resolution, operator procedures, and refund compensation.
  - `worker-recovery.md`: Graceful shutdown, in-flight draining, poison message isolation, and DLQ operations.
  - `fault-injection.md`: Safe non-production chaos engineering harness.
  - `recovery-validation.md`: Empirical test verification summary, RTO/RPO targets, and cost compliance.
* Zero-Cost GCP Policy Compliance ($0 / ₹0 avoidable spend):
  - Cloud SQL instance kept in stopped state (`NEVER`).
  - Total Phase 16 spend: ₹0 / $0.

---

## [1.5.0-phase15] — Phase 15: Load Testing, Performance Baselines & Capacity Analysis (2026-10-15)

### Added
* Grafana k6 Reproducible Load Testing Suite (`tests/load/`):
  - Centralized test harness and modular scenario architecture:
    * `k6.config.js`: Profiles (`smoke`, `baseline`, `moderate`, `stress`), target environment resolution, safety validation guard against remote Cloud Run / live domains.
    * `lib/thresholds.js`: SLO-calibrated thresholds matching Phase 14 targets (`{scenario:default}` isolated from auth setup).
    * `lib/data.js`: Catalog test data, valid `CreateOrderDto` shipping address generator, correlation ID generator, and HMAC-SHA256 signature generator.
    * `lib/auth.js`: Automated JWT token acquisition with rate-limit friendly setup lifecycle.
    * `scenarios/health.js`: Stage A container liveness and health probes (100% checks passed, P95: 4.76 ms).
    * `scenarios/catalog.js`: Stage B categories, paginated search, category filtering, and product detail lookup (100% checks passed, P95: 7.51 ms).
    * `scenarios/cart.js`: Stage C authenticated cart mutations (add item, view cart, clear cart) (100% checks passed, P95: 8.52 ms).
    * `scenarios/checkout.js`: Stage C checkout order placement with DTO validation and offline DB handling (100% checks passed, P95: 34.49 ms).
    * `scenarios/order-lifecycle.js`: Stage C & D state machine lifecycle (place, fetch, cancel, duplicate cancel idempotency) (100% checks passed, P95: 7.55 ms).
    * `scenarios/event-processing.js`: Stage D signed payment webhook processing, duplicate delivery idempotency, and forged signature security rejection (100% checks passed, P95: 5.96 ms).
    * `index.js`: Composite orchestrator for full-platform validation (100% checks passed).
    * `validate-scripts.js`: Fast static syntax, module exports, and correlation header validator for CI.
* Application Performance Optimizations:
  - `apps/api/src/modules/auth/permissions.service.ts`: Guarded `prisma.rolePermission.findMany` with `useDatabase()` check, eliminating a 2,000ms TCP connection timeout on offline DB mode and reducing authenticated latency to 5.2 ms.
  - `apps/api/src/modules/payments/payments.service.ts`: Connected `useDatabase()` from shared `db-status` module, enabling in-memory fallback stores during database shutdown.
* CI/CD Quality Automation:
  - Added npm scripts: `test:load:validate`, `test:load:smoke`, `test:load:catalog`, `test:load:events`, `test:load:suite`.
  - Added CI workflow step `Validate k6 Load Testing Suite Structure & Scripts` in `.github/workflows/ci.yml`.
* Comprehensive Performance Documentation Suite (`docs/performance/`):
  - `tests/load/README.md`: Suite usage, installation, environment variables, load profiles, and scenario reference.
  - `test-strategy.md`: Architecture, user journeys, zero-cost GCP rules, SLO alignment, and CI gates.
  - `baseline.md`: Empirical benchmark measurements, latency percentiles, throughput, check outcomes, and SLO comparisons.
  - `bottlenecks-and-recommendations.md`: Diagnostic findings, connection pool sizing, caching, and low-cost recommendations.
* Zero-Cost GCP Policy Compliance ($0 / ₹0 avoidable spend):
  - Verified Cloud SQL instance `shopcloud-postgres` kept in stopped state (`NEVER`).
  - Strict guard in `k6.config.js` preventing accidental high-concurrency or stress runs against live Cloud Run endpoints.
  - Benchmarks conducted locally without billable cloud infrastructure.

---

## [1.4.0-phase14] — Phase 14: Monitoring, Observability, Alerting & SLOs (2026-10-14)

### Added
* Google Cloud Logging Structured JSON Format & Privacy Redaction (`@shopcloud/contracts`, `apps/api`, `apps/workers`):
  - Standardized JSON logging pipeline matching Google Cloud Logging syslog severity levels (`DEBUG`, `INFO`, `NOTICE`, `WARNING`, `ERROR`, `CRITICAL`).
  - Implemented automated deep redaction engine (`redactSensitiveData`, `redactString`, `isSensitiveKey`):
    * Key-based redaction for passwords, JWT tokens, API keys, secrets, authorization headers, cookies, and payment attributes (card numbers, CVV, PAN).
    * Regex masking for embedded database connection passwords (`postgresql://user:[REDACTED]@...`), Bearer tokens, raw JWT signatures, and credit card PANs (`****-****-****-1234`).
  - Truncated and bounded exception stack traces (maximum 5 frames, sanitized) to prevent log bloat and duplicate error emissions.
  - Implemented `StructuredLoggerService` for NestJS API Gateway with automatic local development vs production JSON formatting.
  - Implemented `WorkerLogger` for Async Workers daemon with structured lifecycle event emission (`outcome: SUCCESS | DUPLICATE_IGNORED | FAILED`, `durationMs`, `retryCount`).
* Correlation ID & Distributed Trace Propagation:
  - Built Express `CorrelationMiddleware` using Node.js `AsyncLocalStorage` (`node:async_hooks`).
  - Captured and propagated `x-correlation-id` and `x-request-id` headers, echoing `x-correlation-id` in HTTP response headers and error envelopes.
  - Parsed Google Cloud Trace context (`X-Cloud-Trace-Context`) and W3C `traceparent` headers, automatically setting `logging.googleapis.com/trace` and `logging.googleapis.com/spanId` for log-to-trace navigation in GCP.
  - Propagated correlation IDs from API through outbox events and Pub/Sub message attributes into background worker execution.
* HTTP Access Logging & Health Probe Log Noise Suppression:
  - Built `HttpLoggingInterceptor` capturing request method, sanitized URL, response status code, latency, and client IP.
  - Categorized high-frequency container health probes (`/health`, `/health/liveness`) to `DEBUG` severity, preventing log ingestion charges in production while preserving detailed logging for business traffic.
* Terraform-Managed Observability Infrastructure (`infrastructure/terraform/modules/monitoring`):
  - Provisioned Cloud Monitoring Operational Dashboard `ShopCloud Operations Dashboard (dev)`:
    * Cloud Run request rate by service and HTTP status code class.
    * Cloud Run 95th percentile request latency.
    * Cloud Run 5xx server error rate.
    * Container CPU & memory utilization percentiles.
    * Active container instances tracking scale-to-zero behavior.
    * Pub/Sub worker subscription undelivered message backlog.
    * Pub/Sub oldest unacknowledged message age.
    * Dead-Letter Queue (DLQ) backlog activity.
  - Provisioned 4 symptom-based Cloud Monitoring Alert Policies:
    * `ShopCloud - Sustained 5xx Server Errors (dev)`: Triggers on 5xx error rate > 1 req/sec for 5 minutes.
    * `ShopCloud - High Request Latency P95 (dev)`: Triggers on P95 latency > 1500ms for 5 minutes.
    * `ShopCloud - PubSub Worker Backlog Accumulation (dev)`: Triggers on undelivered messages > 100 for 10 minutes.
    * `ShopCloud - Dead Letter Queue Activity (dev)`: Triggers on DLQ messages > 0 for 5 minutes.
* Service Level Objectives (SLOs) & Incident Playbooks:
  - Formulated formal mathematical SLIs and SLOs for API Availability (99.5%), API Latency (P95 <= 500ms), Event Processing Reliability (99.9%), and Payment Webhook Processing Reliability (99.9%).
  - Comprehensive operational incident runbooks in `docs/observability/incident-runbooks.md` covering 5xx investigations, latency diagnosis, backlog triage, DLQ recovery, payment webhook debugging, and intentional cost-saving shutdown verification.
* Zero-Cost Policy Compliance ($0 / ₹0 avoidable GCP spend):
  - Relied strictly on free native GCP platform metrics, zero custom metric fees.
  - Pinned Cloud SQL activation policy to `NEVER` (verified `STOPPED`).
  - Kept notification channels list empty (`[]`) by default to prevent external SMS or integration costs.

---

## [1.3.0-phase13] — Phase 13: Terraform Infrastructure as Code (IaC) (2026-10-14)

### Added
* Modular Infrastructure as Code Architecture (`infrastructure/terraform/`):
  - Upgraded Terraform baseline to `>= 1.5.0` with official Google Provider `hashicorp/google ~> 5.30`.
  - Refactored monolithic stubs into focused, single-responsibility domain modules:
    * `modules/iam`: Manages service accounts (`shopcloud-api-runtime`, `shopcloud-web-runtime`, `shopcloud-worker-runtime`, `shopcloud-github-deployer`), Workload Identity Federation (WIF) pool `shopcloud-github-pool`, GitHub Actions OIDC provider, and least-privilege role bindings.
    * `modules/artifact-registry`: Manages standard Docker repository `shopcloud` in `asia-south1` and deployer image publishing IAM permissions.
    * `modules/secret-manager`: Manages secret metadata containers (`shopcloud-dev-database-url`, `shopcloud-dev-jwt-access-secret`, `shopcloud-dev-jwt-refresh-secret`) and runtime accessor IAM bindings without storing raw secret payloads in state.
    * `modules/storage`: Manages durable media GCS bucket (`shopcloud-media-24903284190`) with Uniform Bucket-Level Access (UBLA), Public Access Prevention (PAP), 7-day multipart upload abort lifecycle, and API runtime objectUser IAM permissions.
    * `modules/pubsub`: Manages domain events topic (`shopcloud-domain-events`), worker dead-letter topics (`shopcloud-inventory-dlq`, `shopcloud-notification-dlq`), worker push/pull subscriptions with ordering and exponential backoff retry policies, and Pub/Sub service agent DLQ publishing bindings.
    * `modules/cloud-sql`: Manages Cloud SQL PostgreSQL 16 database instance (`shopcloud-postgres`) strictly pinned to `activation_policy = "NEVER"`, logical database `shopcloud`, and client IAM bindings.
    * `modules/cloud-run`: Manages Cloud Run v2 services (`shopcloud-api` and `shopcloud-web`) with scale-to-zero autoscaling, native Cloud SQL unix domain socket mounting, secret environment variables, and public HTTP invoker bindings.
  - Environment orchestration in `environments/dev/` providing root wiring, typed variables, outputs, and sanitized `terraform.tfvars.example`.
* Terraform CI Quality & Security Gate (`.github/workflows/ci.yml`):
  - Integrated automated Terraform check job in GitHub Actions executing `terraform fmt -check -recursive` and `terraform validate` across environments.
  - Hardened CI security checker (`scripts/ci-security-check.js`) to reject tracked `.tfstate`, `.tfstate.backup`, `.tfplan`, and unexampled `.tfvars` files.
* Zero-Cost Policy Enforcement ($0 / ₹0 avoidable GCP spend):
  - Pinned Cloud SQL instance activation policy to `NEVER` to prevent compute billing.
  - Leveraged native Cloud SQL Unix domain socket sidecar proxy (`run.googleapis.com/cloudsql-instances`) to eliminate costly Serverless VPC Access Connectors (~$10–$18/month saved).
  - Maintained scale-to-zero (`min_instance_count = 0`) across all Cloud Run services.
* Comprehensive Documentation Suite in `docs/terraform/`:
  - `architecture.md`: IaC structure, module dependency graph, live GCP mapping, and zero-cost design principles.
  - `import-and-state.md`: Resource-to-address mapping, step-by-step import runbook, approval-gated GCS backend bootstrap procedure, and state disaster recovery.
  - `operations-and-rollback.md`: Standard operational lifecycle, mandatory human approval gates, drift detection runbook, and rollbacks.
  - `cost-and-security.md`: Zero-cost checklist, Secret Manager payload protection architecture, least-privilege IAM matrix, and Trivy static security analysis findings.

---

## [1.2.0-phase12] — Phase 12: CI/CD Automation, Security Gates & Controlled Deployments (2026-10-14)

### Added
* Automated Continuous Integration Pipeline (`.github/workflows/ci.yml`):
  - Ephemeral PostgreSQL 16 container (`postgres:16-alpine`) for zero-cost integration test validation.
  - Deterministic dependency installation via `npm ci` with GitHub Actions npm cache.
  - Strict build ordering: `@shopcloud/contracts` → `@shopcloud/database` → `@shopcloud/api`, `@shopcloud/workers`, and `@shopcloud/web`.
  - Ephemeral database migration application (`npm run db:migrate:deploy`) and test database seeding (`npm run db:seed`).
  - Strict monorepo typecheck gate (`npm run typecheck`) across all five packages and applications.
  - Monorepo lint gate (`npm run lint`) and full test suite execution (`npm test`).
  - Multi-stage Docker build and Cloud Run contract smoke test matrix for `api`, `web`, and `worker` validating that containers boot and respond with HTTP 200 on injected `$PORT` (`/api/v1/health/liveness`, `/health`).
  - Docker Compose configuration syntax validation (`docker compose -f compose.yaml config --quiet`).
* Security & Secret Leakage Auditing (`scripts/ci-security-check.js`):
  - Automated git-tracked file inspection preventing accidental check-in of `.env`, `.pem`, `.key`, or service account credentials.
  - Pattern matching for high-risk secret markers (private keys, service account JSON headers, personal access tokens).
  - Production dependency vulnerability gate via `npm audit --omit=dev --audit-level=critical`.
* Keyless Google Cloud Authentication via Workload Identity Federation (WIF):
  - Cryptographic OpenID Connect (OIDC) token exchange with Google Cloud Security Token Service (STS).
  - Organization policy enforcement (`iam.disableServiceAccountKeyCreation`) preventing static credential generation.
  - Strict numeric identity pinning (`assertion.repository_id == '1401646031' && assertion.repository_owner_id == '292493253'`).
  - Read-only token and least-privilege verification workflow (`.github/workflows/gcp-wif-check.yml`).
* Immutable Container Publishing Pipeline (`.github/workflows/build-images.yml`):
  - Multi-stage Buildx compilation with GitHub Actions layer caching.
  - Dual immutable commit SHA tagging (`:${GITHUB_SHA}` and `:${GITHUB_SHA::7}`) and semantic release tagging (`:v*`, `:latest`).
  - Image digests recorded and exported directly to GitHub Actions Step Summaries.
* Controlled Cloud Run Deployment Pipeline (`.github/workflows/deploy.yml`):
  - Safe preflight gate triggered only after CI passes on `main` or via manual `workflow_dispatch`.
  - Automated deployment of `shopcloud-api` and `shopcloud-web` in `asia-south1` referencing immutable image tags.
  - Post-deployment live smoke verification checking `/api/v1/health/liveness` and `/health`.
  - Comprehensive Step Summary reporting deployed revision IDs, live URLs, commit SHAs, and instant rollback runbook commands.
* IAM Least-Privilege Grants:
  - `shopcloud-github-deployer` granted `roles/run.developer` on `shopcloud-api` and `shopcloud-web`.
  - `shopcloud-github-deployer` granted `roles/iam.serviceAccountUser` on `shopcloud-api-runtime` and `shopcloud-web-runtime`.
* Cost Control & Zero-Spend Verification:
  - Maintained ₹0 / $0 avoidable GCP spend target.
  - Production Cloud SQL instance (`shopcloud-postgres`) verified `STOPPED` with activation policy `NEVER`.
  - Cloud Run services configure `min-instances=0` (scale-to-zero when idle).
* Comprehensive Documentation in `docs/ci-cd/`:
  - `architecture.md`: Pipeline architecture, dependency graph, and zero-cost design.
  - `workflows.md`: Detailed triggers, jobs, and step guarantees.
  - `security-and-wif.md`: Workload Identity Federation, OIDC token exchange, and least-privilege matrix.
  - `deployment-and-rollback.md`: Cloud Run deployment flow, health probes, and instant traffic rollback runbook.
  - `validation.md`: Verification results, test checklists, and cost compliance evidence.

---

## [0.11.0-phase11] — Phase 11: Payment Processing, Webhooks & Order Lifecycle (2026-10-10)

### Added
* Provider-independent payment gateway abstraction (`PaymentProvider`) with pluggable adapter architecture:
  - `TestPaymentAdapter`: Deterministic in-memory and HMAC cryptographic test adapter designed for CI/CD and cost-free local/staging testing.
  - `RazorpayPaymentAdapter`: Indian market adapter with `x-razorpay-signature` verification and integer INR paise calculations for UPI, Cards, and NetBanking.
  - `StripePaymentAdapter`: Global payment intent adapter with 300-second timestamp replay tolerance and `stripe-signature` v1 HMAC verification.
* Server-Authoritative Financial Calculation:
  - Payment amounts are strictly derived from `order.grandTotal` in minor currency units (paise) inside database transactions.
  - Client-supplied amounts are ignored or rejected, preventing price tampering.
* Cryptographic Webhook Security:
  - Preserved byte-exact raw bodies with `rawBody: true` in NestJS application options.
  - Constant-time HMAC-SHA256 signature verification (`crypto.timingSafeEqual`) defeating timing attack vectors.
* Durable Idempotency Ledger:
  - Replay-protected webhook processing leveraging `ProcessedEvent` table unique constraint `[eventId, consumer]`.
  - Duplicate webhook deliveries safely return `DUPLICATE_IGNORED` without executing secondary state mutations.
* ACID Inventory Compensation & Stock Release:
  - Atomic inventory restoration on payment failure (`PAYMENT_FAILED`) or admin-initiated refund (`REFUNDED`).
  - Audited via `InventoryMovement` with reasons `ORDER_PAYMENT_FAILED_RELEASE` and `ORDER_REFUND_RELEASE`.
* Canonical Domain Events in `@shopcloud/contracts`:
  - `payment.initiated.v1`, `payment.succeeded.v1`, `payment.failed.v1`, `payment.refunded.v1`.
  - Atomically recorded in `OutboxEvent` in the same database transaction as payment/order state updates.
* Prisma migration `20261010120000_add_payment_transaction_indices` adding performance indices on `Payment(transactionRef)` and `PaymentEvent(providerRef)`.
* Comprehensive test coverage:
  - 14/14 unit tests passed in `apps/api` (`payments.service.spec.ts`).
  - 10/10 live tests passed against Google Cloud SQL via Cloud SQL Auth Proxy (`scripts/validate-phase11.ts`).
* Cost Control Verification:
  - Cloud SQL activation policy returned to `NEVER` immediately following test completion (`STOPPED`).
  - Target ₹0 / $0 avoidable spend achieved.
* Documentation in `docs/payments/` (`README.md`, `payment-lifecycle.md`, `webhook-security.md`, `testing.md`).

---

## [0.10.0-phase10] — Phase 10: Google Cloud Pub/Sub & Event-Driven Workers (2026-10-09)

### Added
* Google Cloud Pub/Sub production event streaming infrastructure in `asia-south1` (Project `project-c3f386b1-6c37-468d-8ee`):
  - Primary topic `shopcloud-domain-events` with 7-day retention.
  - Dead-letter topics `shopcloud-inventory-dlq` and `shopcloud-notification-dlq`.
  - Worker subscriptions `shopcloud-inventory-sub` and `shopcloud-notification-sub` with message ordering enabled (`--enable-message-ordering`), dead-letter policies (`max-delivery-attempts=5`), and exponential retry backoff (10s–600s).
  - Dead-letter operator review subscriptions `shopcloud-inventory-dlq-sub` and `shopcloud-notification-dlq-sub`.
* IAM least-privilege policies:
  - Pub/Sub service agent granted `roles/pubsub.publisher` on DLQ topics and `roles/pubsub.subscriber` on worker subscriptions.
  - `shopcloud-api-runtime` granted `roles/pubsub.publisher` on `shopcloud-domain-events`.
  - `shopcloud-worker-runtime` granted `roles/pubsub.subscriber` on worker subscriptions and `roles/pubsub.publisher` on domain events topic.
* Canonical domain event taxonomy in `@shopcloud/contracts`: `order.created.v1`, `order.confirmed.v1`, `order.cancelled.v1`, `inventory.reservation.requested.v1`, `inventory.reserved.v1`, `inventory.released.v1`, `notification.requested.v1`.
* Standard `EventEnvelope<T>` schema and CNCF CloudEvents v1.0 bidirectional converter (`toCloudEvent`, `fromCloudEvent`).
* Transactional Outbox Pattern in `@shopcloud/database` and `apps/api`:
  - `OutboxEvent` PostgreSQL model with indices on `[status, availableAt]`, `[aggregateType, aggregateId]`, and `correlationId`.
  - `OutboxService` in `apps/api` recording outbox entries within the same ACID `$transaction` as order creation, eliminating dual-write risks.
  - Immediate outbox dispatcher with optimistic claiming and exponential retry backoff.
* Durable Consumer Idempotency in `@shopcloud/database` and `apps/workers`:
  - `ProcessedEvent` PostgreSQL model with unique constraint on `[eventId, consumer]` preventing duplicate execution during Pub/Sub at-least-once delivery.
* Worker services (`apps/workers`):
  - `InventoryWorker`: Processes `order.created.v1` and `inventory.released.v1`, atomically checks stock, enforces non-negative constraints, records `InventoryMovement` audit log, inserts `ProcessedEvent` marker, and emits downstream `inventory.reserved.v1` and `notification.requested.v1`.
  - `NotificationWorker`: Processes `notification.requested.v1`, verifies idempotency, and records communication state in `Notification` table with `correlationId`.
  - Dual delivery mode: streaming pull daemon or Cloud Run push endpoint with OIDC JWT verification against Google OAuth2 certs.
* Prisma migration `20261008120000_add_outbox_and_idempotency` deployed and verified on Cloud SQL.
* 10/10 live end-to-end integration tests passed against live Google Cloud SQL and live GCP Pub/Sub.
* Cloud SQL instance stopped (`NEVER`) immediately following live validation to guarantee $0 compute spend.
* Architecture documentation in `docs/gcp/pubsub.md`, `docs/gcp/event-driven-architecture.md`, and `docs/gcp/workers.md`.

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
