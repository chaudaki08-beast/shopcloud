# Phase 6 Validation

All results below are real output captured on 2026-10-04 with gcloud SDK 533.0.0
(configuration `shopcloud`, account `chaudaki08@gmail.com`, quota project `project-c3f386b1-6c37-468d-8ee`).
Nothing is inferred.

## 1. GCP validation

| # | Check | Command | Actual result | Status |
| --- | --- | --- | --- | --- |
| 1 | Active project | `gcloud config list` | `project = project-c3f386b1-6c37-468d-8ee` | **PASS** |
| 2 | Project number | `gcloud projects describe project-c3f386b1-6c37-468d-8ee` | `24903284190`, `ACTIVE`, name `ShopCloud Dev`, 4 labels | **PASS** |
| 3 | Region | architecture decision (no project default existed) | `asia-south1` | **PASS** |
| 3a | Billing | `gcloud billing projects describe …` | `billingEnabled: true`, `billingAccounts/019096-A2B4E0-C3697C` (INR, open) | **PASS** |
| 3b | Budget | `gcloud billing budgets list --billing-account=019096-A2B4E0-C3697C` | `shopcloud-dev-monthly 500 INR`, thresholds 0.5 / 0.9 / 1.0, filter `projects/24903284190` | **PASS** |
| 4 | Foundation APIs | `gcloud services list --enabled` | `artifactregistry`, `billingbudgets`, `cloudbilling`, `cloudresourcemanager`, `iam`, `iamcredentials`, `logging`, `monitoring`, `secretmanager`, `serviceusage`, `sts` (+ Google default `storage`) | **PASS** |
| 4a | Deferred APIs not enabled | `gcloud services list --enabled` | `run`, `sqladmin`, `pubsub`, `container`, `gkehub` absent | **PASS** |
| 5 | Artifact Registry repository | `gcloud artifacts repositories list --location=asia-south1` | `shopcloud DOCKER 0` bytes; `docker images list` → 0 images | **PASS** |
| 5a | Cleanup policy | `gcloud artifacts repositories describe shopcloud --location=asia-south1` | `keep-latest-10`, `delete-untagged-7d`, `delete-older-30d`; not dry-run | **PASS** |
| 6 | Service accounts | `gcloud iam service-accounts list` | `shopcloud-api-runtime`, `shopcloud-worker-runtime`, `shopcloud-github-deployer` | **PASS** |
| 6a | No user-managed keys | `gcloud iam service-accounts keys list --managed-by=user` | 0 / 0 / 0 | **PASS** |
| 6b | No ShopCloud project-level roles | `gcloud projects get-iam-policy …` | only `roles/owner user:chaudaki08@gmail.com` and Google's `roles/artifactregistry.serviceAgent` | **PASS** |
| 6c | Key creation blocked | `gcloud resource-manager org-policies describe iam.disableServiceAccountKeyCreation --effective` | `enforced: true` | **PASS** |
| 7 | WIF pool / provider | `gcloud iam workload-identity-pools providers describe github-actions …` | `ACTIVE`, condition `assertion.repository_id == '1401646031' && assertion.repository_owner_id == '292493253'` | **PASS** |
| 7a | WIF end-to-end | GitHub Actions `GCP WIF Check` | run `37192436373`: `Token issued for: shopcloud-github-deployer@…` | **PASS** |
| 7b | Deployer least privilege | same run | registry read **200**; secret read **403**; project IAM policy **403** | **PASS** |
| 8 | Secret Manager | `gcloud secrets list`; `versions list`; `get-iam-policy` | 3 secrets, 0 versions each, `asia-south1`, accessors as in [security.md](security.md) | **PASS** |
| 9 | Logging | `gcloud logging buckets list`; `gcloud logging read …` | `_Default` 30 d, `_Required` 400 d; `GenerateAccessToken` audit entries returned | **PASS** |
| 10 | Monitoring | `GET monitoring.googleapis.com/v3/projects/…/metricDescriptors?pageSize=1` | HTTP `200`; no alert policies or dashboards (Phase 14) | **PASS** |

### Troubleshooting notes

- **Billing (resolved):** the original billing account `01580E-E37F69-97296D` was closed, so enabling Artifact Registry and
  Secret Manager failed with `FAILED_PRECONDITION: Billing account for project '24903284190' is not found`. The owner opened
  `019096-A2B4E0-C3697C`; the project was then linked with `gcloud billing projects link` (owner-approved).
- **Billing API rate limit:** without a quota project, gcloud billing calls run against Google's shared gcloud client project,
  which returned `RESOURCE_EXHAUSTED … cloudbilling.googleapis.com`. Fixed by enabling `cloudbilling.googleapis.com` and
  setting `billing/quota_project` in the `shopcloud` configuration.
- **WIF first run:** run `37189060205` failed with `Permission 'iam.serviceAccounts.getAccessToken' denied` two minutes after the
  IAM binding was created (propagation). A rerun succeeded; the identity check additionally needed the `userinfo.email` scope.

## 2. Application validation (local, Windows, Node 22.18.0, npm 10.9.3)

| Check | Command | Result | Status |
| --- | --- | --- | --- |
| Prisma schema | `npx prisma validate` | valid | **PASS** |
| Migrations | `npm run db:status` | 3 migrations, `Database schema is up to date!` | **PASS** |
| Build | `npm run build` (after contracts → database) | exit 0 | **PASS** |
| TypeScript | `tsc --noEmit` in api, workers, web, contracts, database | all exit 0 | **PASS** |
| Tests | `npm test` | API **101/101** (11 suites), worker **6/6**, `@shopcloud/database` integration suite passed | **PASS** |
| Docker | `docker build` | **NOT AVAILABLE** locally — Docker daemon unavailable in this environment | **NOT AVAILABLE** (local) |
| Docker (CI) | CI `docker` job | 3 images build; web and worker containers healthy on `PORT=8080` | **PASS** |

## 3. GitHub Actions

| Run | Workflow | Result |
| --- | --- | --- |
| 37189323203 | GCP WIF Check | success — identity verified |
| 37190026916 | GCP WIF Check (develop) | success |
| 37191577215 | ShopCloud CI Pipeline (develop, after Cloud Run readiness fixes) | success — build, tests, 3 images, container smoke tests |
| 37192436373 | GCP WIF Check (least-privilege checks) | success — 200 / 403 / 403 |

CD remains intentionally unconfigured (its secrets are unset until Phase 12 — see [iam.md §5](iam.md#5-values-for-the-cd-workflow-phase-12)).

## Phase 7 — Cloud Run

Captured 2026-10-04 against the live services. Nothing below is simulated.

### Images (Artifact Registry)

| Image | Tags | Digest | Built by |
| --- | --- | --- | --- |
| `asia-south1-docker.pkg.dev/project-c3f386b1-6c37-468d-8ee/shopcloud/api` | `phase7-0fb8b77`, `0fb8b77d…` | `sha256:912f4fd1e8abeca2968be924b3218d8f922a3ff412bc59fbadcfbf7fdbe8cc0b` | `Build & Push Images` run `37194645042` (WIF) |
| `asia-south1-docker.pkg.dev/project-c3f386b1-6c37-468d-8ee/shopcloud/web` | `phase7-0fb8b77`, `0fb8b77d…` | `sha256:9864c076b5cadf64161de1a1980480906944708594fa5e8fe046730a09d1b988` | same run |
| (superseded) api / web | `phase7-60322be` | `sha256:74fb1997…` / `sha256:3e9a0b12…` | run `37194023120` — API image crashed on start (`dotenv` not copied) |

Verified with `gcloud artifacts docker images list … --include-tags` and `gcloud artifacts docker images describe`.

### Deployment

| Check | Result | Status |
| --- | --- | --- |
| `run.googleapis.com` enabled | yes; Google also auto-enabled `containerregistry` and `pubsub` as Cloud Run dependencies — 0 Pub/Sub topics, 0 subscriptions exist | **PASS** |
| API revision serving | `shopcloud-api-00004-rmg` 100 % | **PASS** |
| Web revision serving | `shopcloud-web-00001-62k` 100 % | **PASS** |
| Container honours `PORT` | API log `listening on http://0.0.0.0:8080`; web `listen ${PORT}` → 8080 | **PASS** |
| Rollback | traffic → `00003-dgn` (liveness 200) → latest `00004-rmg` (liveness 200) | **PASS** |
| CI container smoke test | API (production mode, no DB), web and worker images healthy on `PORT=8080` — CI run `37194645035` | **PASS** |

### API smoke test — https://shopcloud-api-24903284190.asia-south1.run.app

| Request | Expected | Actual | Status |
| --- | --- | --- | --- |
| `GET /api/v1/health/liveness` | 200 | 200 `{"status":"UP"}` | **PASS** |
| `GET /api/v1/health` | 503 until Phase 8 | 503, `database: unhealthy, "PostgreSQL unreachable"` | **PASS** (honest) |
| `GET /api/v1/products` | 503 (no DB) | 503 `DATABASE_UNAVAILABLE` | **DEFERRED TO PHASE 8** |
| `POST /api/v1/auth/login` (demo credentials) | 503 (no DB, no demo fallback) | 503 | **DEFERRED TO PHASE 8** |
| `GET /api/v1/cart`, `/orders`, `/auth/me`, `/admin/dashboard` — no token | 401 | 401 ×4 | **PASS** |
| `GET /api/v1/cart` with a forged JWT | 401 | 401 | **PASS** |
| `GET /api/v1/cart` with `x-user-id: usr-admin-demo` | 401 | 401 | **PASS** |
| Authenticated request | 200 | not possible without users in a database | **DEFERRED TO PHASE 8** |
| CORS from `https://evil.example` | no `Access-Control-Allow-Origin` | none | **PASS** |
| `http://` | redirect to HTTPS | 302 → `https://…` | **PASS** |
| `GET /api/docs` | 200 | 200 | **PASS** |

### Web smoke test — https://shopcloud-web-24903284190.asia-south1.run.app

| Request | Actual | Status |
| --- | --- | --- |
| `GET /` | 200, title "ShopCloud — Cloud-Native Event-Driven E-Commerce" | **PASS** |
| `GET /orders` (SPA deep link) | 200, `index.html` with `#root` | **PASS** |
| `GET /health` | 200 `{"status":"UP","service":"shopcloud-web"}` | **PASS** |
| `GET /assets/index-*.js` | 200, `Cache-Control: public, max-age=31536000, immutable` | **PASS** |
| `GET /api/v1/health/liveness` via web proxy | 200 `{"status":"UP"}` (nginx → API over HTTPS with Host/SNI) | **PASS** |
| `GET /api/v1/products` / `/cart` via proxy | 503 / 401 (API responses passed through) | **PASS** (DB deferred) |
| Bundle: `localhost` / `127.0.0.1` | 0 occurrences | **PASS** |
| Bundle: `http://` URLs other than XML namespaces | 0 | **PASS** |
| Browser console | only expected 503/401 from DB-backed calls; no mixed-content warnings | **PASS** |
| Security headers | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` | **PASS** |
| `http://` | 302 → HTTPS | **PASS** |

### Security & logging

| Check | Result | Status |
| --- | --- | --- |
| Runtime identities | api → `shopcloud-api-runtime`, web → `shopcloud-web-runtime` (no roles) | **PASS** |
| Project-level roles | owner + Google service agents only; default compute SA has none (org policy) | **PASS** |
| Secrets | `JWT_ACCESS_SECRET` from Secret Manager `:2`; no secret in env literals, images, git, YAML or docs | **PASS** |
| Non-root | API image `USER node`; nginx master runs as root (documented, acceptable on Cloud Run) | **PASS** |
| Cloud Logging | request, stdout/stderr and system logs for both services | **PASS** |
| Sensitive data in logs | 0 matches for JWTs, passwords, `Authorization`, secret names with values, `postgresql://` | **PASS** |

### Application tests (local, Phase 7 branch)

`npm run build` ✅ · `npm test`: API **105/105** (12 suites), worker **6/6**, `@shopcloud/database` integration suite ✅ ·
`tsc --noEmit` ✅ · Docker: **NOT AVAILABLE** locally (built and smoke-tested in CI).

---

# Phase 8 Validation — Cloud SQL & Production Database

Captured on **2026-10-05** with Google Cloud SDK 533.0.0 (`asia-south1`, project `project-c3f386b1-6c37-468d-8ee`).

## 1. Cloud SQL Infrastructure Validation

| # | Check | Command | Actual Result | Status |
| :- | :--- | :--- | :--- | :- |
| 1 | API Enablement | `gcloud services list --enabled --filter="name:sqladmin*"` | `sqladmin.googleapis.com` enabled | **PASS** |
| 2 | Cloud SQL Instance | `gcloud sql instances describe shopcloud-postgres` | `RUNNABLE`, `POSTGRES_16`, `db-custom-1-3840`, `asia-south1-c`, 10GB SSD | **PASS** |
| 3 | Network Security | `gcloud sql instances describe shopcloud-postgres --format="value(settings.ipConfiguration.authorizedNetworks)"` | Empty (zero authorized external IP networks) | **PASS** |
| 4 | Application Database | `gcloud sql databases list --instance=shopcloud-postgres` | `shopcloud` (UTF8, en_US.UTF8) | **PASS** |
| 5 | Application User | `gcloud sql users list --instance=shopcloud-postgres` | `shopcloud_app` (dedicated non-superuser) | **PASS** |
| 6 | Secret Manager Integration | `gcloud secrets versions list shopcloud-dev-database-url` | Version 2 active with pool parameters (`connection_limit=10&pool_timeout=20`) | **PASS** |
| 7 | IAM Permissions | `gcloud projects get-iam-policy ...` | `roles/cloudsql.client` granted to `shopcloud-api-runtime` | **PASS** |
| 8 | Cloud Run Connection | `gcloud run services describe shopcloud-api` | `--add-cloudsql-instances` attached; revision `shopcloud-api-00006-b95` | **PASS** |
| 9 | Baseline Backup | `gcloud sql backups list --instance=shopcloud-postgres` | Backup ID `1791191580964` (`SUCCESSFUL`) | **PASS** |

## 2. Database Schema & Migration Validation

| Check | Command | Actual Result | Status |
| :--- | :--- | :--- | :- |
| Migration Deployment | `prisma migrate deploy` | 3 migrations applied cleanly (`20261003090131`, `20261003120541`, `20261004085326`) | **PASS** |
| Migration Status | `prisma migrate status` | `Database schema is up to date!` (0 pending migrations) | **PASS** |
| Model Validation | Information Schema inspection | 21 tables created and verified | **PASS** |
| Production Seed | `npm run db:seed:prod` | 6 Categories, 6 Products, 19 Permissions, 51 RolePermissions, 1 Coupon, 0 dev accounts | **PASS** |

## 3. Real Cloud Run + Cloud SQL E2E Smoke Tests (39/39 Passed)

Executed against live production deployment `https://shopcloud-api-24903284190.asia-south1.run.app`:

| Test Group | Tests Executed | Result | Status |
| :--- | :--- | :--- | :- |
| **Health Check** | `/api/v1/health` probes PostgreSQL via Unix socket | HTTP 200, `database: healthy`, latency 7ms | **PASS** |
| **Catalog** | Categories list, Products list, Product detail by ID | HTTP 200, 6 categories, 6 products verified | **PASS** |
| **Authentication** | Register new user, Login, Profile (`/auth/me`), Token rotation | HTTP 201/200, JWT issued, permissions linked | **PASS** |
| **RBAC Security** | Customer account attempts access to `/api/v1/admin/dashboard` | HTTP 403 Forbidden | **PASS** |
| **Cart Operations** | Get cart, add item, update quantity (2 -> 3) | HTTP 200/201, server-side calculated totals | **PASS** |
| **Order Placement** | Transactional checkout (`ORD-002513-9538`) | HTTP 201, status `CONFIRMED`, line items created | **PASS** |
| **Inventory Decrement** | Cloud SQL inventory verification post-order | Stock decremented in DB from 10 to 7 | **PASS** |
| **Order Retrieval** | Order detail by ID, User order history list | HTTP 200, ownership verified | **PASS** |
| **Session Revocation** | User logout, revoked refresh token reuse attempt | HTTP 200 on logout; HTTP 401 on token reuse | **PASS** |

## 4. Transaction Integrity & Failure Rollback (9/9 Passed)

| Invariant | Test | Result | Status |
| :--- | :--- | :--- | :- |
| **Unique Constraint** | Insert duplicate email into `User` table | Throws Prisma error `P2002` | **PASS** |
| **Foreign Key Constraint** | Insert `OrderItem` referencing non-existent `orderId` | Throws Prisma error `P2003` | **PASS** |
| **Transaction Rollback** | Simulated exception midway through `$transaction` stock decrement | Exception caught; stock restored cleanly | **PASS** |
| **Audit & History** | Insert and query `OrderStatusHistory` and `InventoryMovement` | Verified records in Cloud SQL | **PASS** |

## 5. Security & Secret Exposure Audit

- Repository scanned: Zero production passwords, tokens, or plaintext secrets committed.
- Cloud Run inspect: All secrets injected via Secret Manager references (`valueFrom.secretKeyRef`).
- Cloud Run logs: Inspected logs for `shopcloud-api`; zero credential leakage.
- Cloud SQL network: Direct public access disabled.

---

# Phase 9 Validation — Cloud Storage & Object Storage

Captured on **2026-10-05** against Google Cloud Platform (`asia-south1`, project `project-c3f386b1-6c37-468d-8ee`).

## 1. GCS Bucket Infrastructure Validation

| # | Check | Command / Target | Actual Result | Status |
| :- | :--- | :--- | :--- | :- |
| 1 | Bucket Provisioning | `gcloud storage buckets describe gs://shopcloud-media-24903284190` | `asia-south1`, `STANDARD` storage class, active | **PASS** |
| 2 | Uniform Bucket Access | Bucket configuration | `uniform_bucket_level_access: true` | **PASS** |
| 3 | Public Access Prevention | Bucket configuration | `public_access_prevention: enforced` | **PASS** |
| 4 | Lifecycle Policy | Bucket configuration | `AbortIncompleteMultipartUpload` after 7 days | **PASS** |
| 5 | Least-Privilege IAM | IAM policy on bucket | `roles/storage.objectUser` granted to `shopcloud-api-runtime` | **PASS** |

## 2. Cloud Run & Database Integration

| # | Check | Target | Actual Result | Status |
| :- | :--- | :--- | :--- | :- |
| 1 | Cloud SQL Migration | `prisma migrate deploy` | `20261005102731_add_product_image_storage_metadata` applied cleanly (0 pending) | **PASS** |
| 2 | API Revision Serving | Cloud Run `shopcloud-api` | Revision `shopcloud-api-00007-nxs` serving 100% traffic | **PASS** |
| 3 | Health Probe | `GET /api/v1/health` | HTTP 200, `database: healthy`, latency 8ms | **PASS** |

## 3. Real Cloud Run + Cloud SQL + GCS E2E Validation (31/31 Passed)

Executed against live production deployment `https://shopcloud-api-24903284190.asia-south1.run.app` and bucket `gs://shopcloud-media-24903284190`:

| Step | Test Description | Observed Behavior | Status |
| :--- | :--- | :--- | :- |
| **1** | API Gateway Healthy | HTTP 200 OK | **PASS** |
| **2** | PostgreSQL Reachable from Cloud Run | Healthy probe via Unix socket (8ms) | **PASS** |
| **3** | Register Admin & Customer Accounts | Public `/auth/register` creates test users | **PASS** |
| **4** | Elevate Role to `SUPER_ADMIN` in Cloud SQL | User updated in Cloud SQL database | **PASS** |
| **5** | Authenticate & Obtain JWT Tokens | Both Admin and Customer retrieve valid tokens | **PASS** |
| **6** | Target Product Selection | Fetches live catalog and picks target product | **PASS** |
| **7** | Multipart Image Upload (`POST /images`) | HTTP 201 Created; GCS upload confirmed | **PASS** |
| **8** | Metadata & Key Structure | Valid UUID path: `products/{id}/{uuid}.jpg` | **PASS** |
| **9** | Physical Object in GCS Bucket | Verified via `gcloud storage objects describe` | **PASS** |
| **10** | GCS Object Size Verification | Matches uploaded file (140 bytes) | **PASS** |
| **11** | GCS Content-Type Verification | Confirmed `image/jpeg` in GCS metadata | **PASS** |
| **12** | Image Metadata Retrieval (`GET /images/:id`) | HTTP 200; `storageKey` matches | **PASS** |
| **13** | Stream Image Binary (`GET /images/:id/file`) | HTTP 200; Content-Type `image/jpeg` | **PASS** |
| **14** | Streamed Binary Integrity | Buffer comparison matches byte-for-byte | **PASS** |
| **15** | Signed URL Endpoint (`GET /signed-url`) | HTTP 200; Signed URL or stream fallback returned | **PASS** |
| **16** | Set Primary Image (`PATCH /primary`) | HTTP 200; Atomically updates primary image flag | **PASS** |
| **17** | RBAC Guard: Customer Upload Attempt | HTTP 403 Forbidden | **PASS** |
| **18** | Security Guard: Unauthenticated Upload | HTTP 401 Unauthorized | **PASS** |
| **19** | Security Guard: Spoofed Magic Bytes | HTTP 400 Bad Request; blocked spoofed header | **PASS** |
| **20** | Safety Guard: Nonexistent Product Upload | HTTP 404 Not Found | **PASS** |
| **21** | Delete Image (`DELETE /images/:id`) | HTTP 200 OK; removed from Cloud SQL | **PASS** |
| **22** | GCS Physical Object Cleanup | HTTP 404 Not Found when describing object in GCS | **PASS** |
| **23** | Deleted Image Verification in Database | HTTP 404 Not Found on subsequent GET | **PASS** |
| **24** | Test User Teardown | Removed temporary test accounts from Cloud SQL | **PASS** |

## 4. Cost Control Verification

* Cloud SQL activation policy patched to `NEVER` immediately following test completion.
* Current state: `STOPPED` ($0 compute spend).

---

# Phase 10 Validation — Pub/Sub Event-Driven Architecture & Workers

Captured on **2026-10-09** against live Google Cloud Platform (`asia-south1`, project `project-c3f386b1-6c37-468d-8ee`).

## 1. Pub/Sub Infrastructure Validation

| # | Check | Target / Command | Actual Result | Status |
| :- | :--- | :--- | :--- | :- |
| 1 | API Enablement | `gcloud services list --enabled --filter="name:pubsub*"` | `pubsub.googleapis.com` enabled | **PASS** |
| 2 | Topics Provisioned | `gcloud pubsub topics list` | `shopcloud-domain-events`, `shopcloud-inventory-dlq`, `shopcloud-notification-dlq` created | **PASS** |
| 3 | Worker Subscriptions | `gcloud pubsub subscriptions list` | `shopcloud-inventory-sub`, `shopcloud-notification-sub` (with ordering & DLQ policies) | **PASS** |
| 4 | DLQ Subscriptions | `gcloud pubsub subscriptions list` | `shopcloud-inventory-dlq-sub`, `shopcloud-notification-dlq-sub` (7d retention) | **PASS** |
| 5 | Pub/Sub Service Agent IAM | `gcloud pubsub *-iam-policy-binding` | Granted `roles/pubsub.publisher` on DLQ topics & `roles/pubsub.subscriber` on worker subscriptions | **PASS** |
| 6 | Cloud Run API Runtime IAM | `gcloud pubsub topics add-iam-policy-binding` | `roles/pubsub.publisher` granted on `shopcloud-domain-events` to `shopcloud-api-runtime` | **PASS** |
| 7 | Worker Runtime IAM | `gcloud pubsub *-iam-policy-binding` | `roles/pubsub.subscriber` on worker subscriptions and `roles/pubsub.publisher` on domain events topic | **PASS** |

## 2. Cloud SQL Database Migration

| Check | Target / Command | Actual Result | Status |
| :--- | :--- | :--- | :- |
| Migration Deployment | `prisma migrate deploy` | `20261008120000_add_outbox_and_idempotency` applied cleanly to Cloud SQL | **PASS** |
| Schema Status | `prisma migrate status` | `Database schema is up to date!` (5 migrations, 0 pending) | **PASS** |
| Table Verification | Information Schema query | `OutboxEvent`, `ProcessedEvent`, and updated `Notification` tables confirmed | **PASS** |

## 3. Real Cloud SQL + GCP Pub/Sub E2E Validation (10/10 Passed)

Executed against live Cloud SQL PostgreSQL (`shopcloud-postgres`) and live Google Cloud Pub/Sub topics:

| Test | Objective | Observed Result | Status |
| :--- | :--- | :--- | :- |
| **TEST 1** | Schema & Database Connectivity | `OutboxEvent`, `ProcessedEvent`, `Notification` tables verified via SQL probe | **PASS** |
| **TEST 2** | GCP Pub/Sub Topics & Subscriptions | All 3 topics and 4 subscriptions verified active in `project-c3f386b1-6c37-468d-8ee` | **PASS** |
| **TEST 3** | Fixture Initialization | Test Customer, Category, and Product (stock: 50) initialized in Cloud SQL | **PASS** |
| **TEST 4** | Transactional Outbox Placement | Atomically committed Order & `OutboxEvent` with status `PENDING` | **PASS** |
| **TEST 5** | Outbox Dispatch to GCP Pub/Sub | Published with orderingKey `orderId` to `shopcloud-domain-events`; status updated to `PUBLISHED` | **PASS** |
| **TEST 6** | Inventory Worker Execution | Stock decremented (50 → 47), `InventoryMovement` logged (`ORDER_RESERVED`), downstream events published | **PASS** |
| **TEST 7** | Durable Idempotency Ledger | Verified `ProcessedEvent` record created with consumer `inventory-worker` | **PASS** |
| **TEST 8** | Replay & Duplicate Message Guard | Replayed identical event; worker safely returned `DUPLICATE_IGNORED` and stock remained intact | **PASS** |
| **TEST 9** | Notification Worker Execution | Downstream event processed; `Notification` record created in Cloud SQL with `correlationId` | **PASS** |
| **TEST 10** | Dead-Letter Queue Policy Check | Verified max delivery attempts = 5, retry backoff (10s–600s), and DLQ topic routing | **PASS** |

## 4. Cost Control Verification

* Cloud SQL proxy terminated immediately after test execution.
* Cloud SQL instance `shopcloud-postgres` patched back to `NEVER`.
* Verified instance state: `STOPPED` ($0 compute spend maintained).

---

# Phase 11 Validation — Payment Processing, Webhooks & Order Lifecycle

Captured on **2026-10-10** against live Google Cloud Platform (`asia-south1`, project `project-c3f386b1-6c37-468d-8ee`).

## 1. Cloud SQL Database Migration

| Check | Target / Command | Actual Result | Status |
| :--- | :--- | :--- | :- |
| Migration Deployment | `prisma migrate deploy` | `20261010120000_add_payment_transaction_indices` applied cleanly to Cloud SQL | **PASS** |
| Schema Status | `prisma migrate status` | `Database schema is up to date!` (6 migrations, 0 pending) | **PASS** |
| Index Verification | `pg_indexes` query | `Payment_transactionRef_idx` and `PaymentEvent_providerRef_idx` confirmed active | **PASS** |

## 2. Real Cloud SQL Live Payment Validation (10/10 Passed)

Executed against live Cloud SQL PostgreSQL (`shopcloud-postgres`):

| Test | Objective | Observed Result | Status |
| :--- | :--- | :--- | :- |
| **TEST 1** | Schema & Database Indexes | Verified `Payment_transactionRef_idx` and `PaymentEvent_providerRef_idx` via SQL catalog query | **PASS** |
| **TEST 2** | Fixture Initialization | Test Customer, Category, and Product (stock: 10) created in Cloud SQL | **PASS** |
| **TEST 3** | Server-Authoritative Initiation | Initiated payment for ₹1,999 (199900 paise); status `PENDING`, outbox event `payment.initiated.v1` recorded | **PASS** |
| **TEST 4** | Idempotency Verification | Duplicate initiation resolved to existing payment without duplicate rows | **PASS** |
| **TEST 5** | Signed Webhook Processing | HMAC-SHA256 signature verified; Payment `SUCCESS`, Order `CONFIRMED`, outbox event `payment.succeeded.v1` recorded | **PASS** |
| **TEST 6** | Durable Replay Deduplication | Webhook replay deduplicated via `ProcessedEvent` ledger (`DUPLICATE_IGNORED`) | **PASS** |
| **TEST 7** | Admin Refund Lifecycle | Admin-issued refund; Payment `REFUNDED`, Order `REFUNDED`, outbox event `payment.refunded.v1` recorded | **PASS** |
| **TEST 8** | ACID Compensation & Stock Release | Payment failure webhook cancelled order, restored stock (8 → 10), logged `InventoryMovement`, recorded `payment.failed.v1` | **PASS** |
| **TEST 9** | Outbox Event Verification | Outbox events verified in Cloud SQL with matching correlation IDs | **PASS** |
| **TEST 10** | Fixture Sanitization | Cleanly removed temporary test rows from Cloud SQL | **PASS** |

## 3. Cost Control Verification

* Cloud SQL Auth Proxy terminated immediately after validation completion.
* Cloud SQL instance `shopcloud-postgres` patched back to `NEVER`.
* Final verified instance state: `STOPPED` ($0 compute spend maintained).
* **Cost Status: NO BILLABLE USAGE OBSERVED / CONFIGURED FOR MINIMAL COST.**




