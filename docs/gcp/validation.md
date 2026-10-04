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
