# GCP Foundation

## 1. Project

| Field | Value | Source |
| --- | --- | --- |
| Project ID | `project-c3f386b1-6c37-468d-8ee` | `gcloud projects describe` |
| Project number | `24903284190` | `gcloud projects describe` |
| Display name | `ShopCloud Dev` (renamed from "My First Project" in Phase 6) | `gcloud projects update --name` |
| Parent | organization `842968716907` | `gcloud projects describe` |
| Owner | `user:chaudaki08@gmail.com` (`roles/owner`, only project-level binding) | `gcloud projects get-iam-policy` |
| Labels | `project=shopcloud`, `environment=dev`, `owner=shopcloud`, `managed-by=gcloud` | `gcloud alpha projects update --update-labels` |
| Billing | **enabled** — `billingAccounts/019096-A2B4E0-C3697C` ("My Billing Account 1", INR). The original account `01580E-E37F69-97296D` is closed | `gcloud billing projects describe` |
| Local gcloud configuration | `shopcloud` (separate from the `default` configuration used for other work); `billing/quota_project` = this project | `gcloud config configurations list` |

**Why this project:** the account hit its project-creation quota (`gcloud projects create` failed with
*"exceeded your allotted project quota"*), so the unused "My First Project" was adopted, renamed and labelled.
Its ID cannot be changed. Documentation written in Phase 5 that assumed a project ID of `shopcloud-dev`
is superseded by this file.

## 2. Region

**Primary region: `asia-south1` (Mumbai).** This is the region already recorded in the architecture docs
(ADR-0002, `docs/docker/cloud-run-compatibility.md`) and in `.github/workflows/deploy.yml`. No compute region
was previously configured on this project, so nothing was overridden. Regional resources (Artifact Registry,
Cloud Run, Cloud SQL, buckets) must use `asia-south1`; IAM and WIF are global.

## 3. Environment strategy

| Environment | Where | Status |
| --- | --- | --- |
| `dev` | `project-c3f386b1-6c37-468d-8ee` | **Active** — the only environment for the portfolio build |
| `staging` | Same project, resources suffixed `-staging` | **DEFERRED** — create only if a later phase needs it |
| `prod` | Separate project recommended (blast-radius + IAM isolation) | **DEFERRED** — blocked by the account's project-creation quota |

Environment is carried in every resource name suffix and in the `environment` label, so a later split into
per-environment projects (Phase 13, Terraform) is a move, not a rename.

## 4. APIs

| Service | Status | Reason |
| --- | --- | --- |
| `iam.googleapis.com` | **ENABLED** (Phase 6) | Service accounts, WIF pools |
| `iamcredentials.googleapis.com` | **ENABLED** (Phase 6) | Short-lived token generation for WIF impersonation |
| `sts.googleapis.com` | **ENABLED** (Phase 6) | WIF token exchange (GitHub OIDC → federated token) |
| `cloudresourcemanager.googleapis.com` | **ENABLED** (Phase 6) | Project metadata, IAM policy, labels |
| `serviceusage.googleapis.com` | **ALREADY ENABLED** | Default |
| `logging.googleapis.com` | **ALREADY ENABLED** | Default |
| `monitoring.googleapis.com` | **ALREADY ENABLED** | Default |
| `artifactregistry.googleapis.com` | **ENABLED** (Phase 6, after billing) | Container image registry |
| `secretmanager.googleapis.com` | **ENABLED** (Phase 6, after billing) | Secret containers and per-secret IAM |
| `cloudbilling.googleapis.com` | **ENABLED** (Phase 6) | Billing checks billed to this project (the shared gcloud client project hit `RESOURCE_EXHAUSTED`) |
| `billingbudgets.googleapis.com` | **ENABLED** (Phase 6) | Budget alert |
| `run.googleapis.com` | **DEFERRED** (Phase 7) | Not enabled |
| `sqladmin.googleapis.com` | **DEFERRED** (Phase 8) | Not enabled |
| `pubsub.googleapis.com` | **DEFERRED** (Phase 10) | Not enabled |
| `container.googleapis.com`, `gkehub.googleapis.com` | **DEFERRED** (Phase 17) | Not enabled |
| `storage.googleapis.com` | **ALREADY ENABLED** (Google default) | Not enabled by ShopCloud; no buckets created. Application storage is Phase 9 |

Other Google defaults on the project (BigQuery family, Dataform, Dataplex, Datastore, Cloud Trace, etc.) were
left untouched; they cost nothing while unused. Disabling them is optional cleanup.

## 5. Artifact Registry

| Field | Value |
| --- | --- |
| Repository | `shopcloud` |
| Format | Docker |
| Location | `asia-south1` |
| Host path | `asia-south1-docker.pkg.dev/project-c3f386b1-6c37-468d-8ee/shopcloud` |
| Labels | `project=shopcloud`, `environment=dev`, `component=registry`, `owner=shopcloud`, `managed-by=gcloud` |
| Encryption | Google-managed key |
| Contents | **empty** — no images pushed in Phase 6 |
| Status | **PASS** |

Image naming (one image per deployable, tagged by immutable git SHA, plus a moving `latest` for dev only):

```
asia-south1-docker.pkg.dev/project-c3f386b1-6c37-468d-8ee/shopcloud/api:<git-sha>
asia-south1-docker.pkg.dev/project-c3f386b1-6c37-468d-8ee/shopcloud/web:<git-sha>
asia-south1-docker.pkg.dev/project-c3f386b1-6c37-468d-8ee/shopcloud/worker:<git-sha>
```

Note for Phase 12: `deploy.yml` currently pushes `workers` (plural) — align to `worker`.

Access: `roles/artifactregistry.writer` for `shopcloud-github-deployer` **on this repository only** (verified from
GitHub Actions: repository read → 200). Runtime identities need no registry role — Cloud Run pulls with its own
service agent within the same project.

Cleanup policy (active, not dry-run) — keep rules override delete rules:

| Rule | Action | Condition |
| --- | --- | --- |
| `keep-latest-10` | KEEP | 10 most recent versions per image |
| `delete-untagged-7d` | DELETE | untagged, older than 7 days |
| `delete-older-30d` | DELETE | any version older than 30 days (unless kept above) |

Commands used:

```bash
gcloud services enable artifactregistry.googleapis.com
gcloud artifacts repositories create shopcloud --repository-format=docker --location=asia-south1   --description="ShopCloud container images (api, web, worker)"   --labels=project=shopcloud,environment=dev,component=registry,owner=shopcloud,managed-by=gcloud
gcloud artifacts repositories set-cleanup-policies shopcloud --location=asia-south1 --policy=ar-cleanup.json --no-dry-run
gcloud artifacts repositories add-iam-policy-binding shopcloud --location=asia-south1   --member="serviceAccount:shopcloud-github-deployer@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com"   --role=roles/artifactregistry.writer
```

## 6. Naming & labels

Convention: `shopcloud-<component>-<environment>` for workloads and data resources.

| Resource | Name |
| --- | --- |
| Cloud Run services (Phase 7) | `shopcloud-api-dev`, `shopcloud-web-dev`, `shopcloud-worker-dev` |
| Cloud SQL instance (Phase 8) | `shopcloud-db-dev` |
| Buckets (Phase 9, globally unique) | `shopcloud-media-dev-<project-number>` |
| Pub/Sub (Phase 10) | topics `shopcloud-order-created-dev`, subscriptions `shopcloud-inventory-sub-dev` |
| Secrets (Phase 7+) | `shopcloud-dev-<name>` — see [security.md](security.md) |
| Service accounts (Phase 6) | `shopcloud-<role>` — one project per environment makes an env suffix redundant; IDs max 30 chars |
| WIF | pool `shopcloud-github-pool`, provider `github-actions` |
| Artifact Registry | `shopcloud` (one repository, images per component) |

Phase 12 note: `deploy.yml` targets a Cloud Run service named `shopcloud-dev-api`; align to `shopcloud-api-dev`.

Labels (applied where the resource supports labels — project, Artifact Registry, Cloud Run, Cloud SQL, buckets,
Pub/Sub, secrets; **not** IAM service accounts or WIF pools, which do not support labels):

```
project=shopcloud
environment=dev|staging|prod
component=api|web|worker|database|registry|secrets
owner=shopcloud
managed-by=gcloud      # becomes managed-by=terraform after Phase 13 import
```

## 7. Logging foundation

**Status: PASS** — `logging.googleapis.com` enabled; buckets `_Default` (30-day retention) and `_Required`
(400-day, audit) are ACTIVE; Admin Activity / Data Access entries (e.g. `GenerateAccessToken` from the WIF check)
are readable with `gcloud logging read`.

Cloud Run ingests stdout/stderr automatically. To make logs searchable, application output must become
**structured JSON** (one object per line with `severity`, `message`, and context fields) before Phase 7 —
today the API uses NestJS's plain-text `Logger` and the workers use `console.log`.

| Source | Events to log | Severity |
| --- | --- | --- |
| API — HTTP | request/response lifecycle (method, route, status, latency, request ID / `X-Cloud-Trace-Context`) | INFO / WARNING (4xx) / ERROR (5xx) |
| API — auth | login success/failure, refresh-token rotation, reuse detection, logout | INFO / WARNING |
| API — authz | RBAC/permission denials (user ID, permission, route) | WARNING |
| API — orders | order created, state transitions, cancellations | INFO |
| API — payments (Phase 11) | intent created, webhook received/verified, failures — never card data | INFO / ERROR |
| API — errors | unhandled exceptions with stack | ERROR |
| Workers | job start/end with duration, Pub/Sub message ID, attempt number, ack/nack, DLQ routing | INFO / WARNING / ERROR |
| Security | auth-failure bursts, rate-limit hits, IAM changes (Cloud Audit Logs) | WARNING / NOTICE |

Never log: passwords, tokens, JWTs, `DATABASE_URL`, payment details, full PII.

Retention: keep the free 30-day `_Default` bucket; no log sinks or extra buckets until Phase 14.
Exclusion filters for noisy health-check logs can be added in Phase 14 to stay inside the free ingestion tier.

## 8. Monitoring foundation

**Status: PASS** — `monitoring.googleapis.com` enabled and the Monitoring API answers `metricDescriptors.list`
with HTTP 200. No dashboards, uptime checks or alert policies exist (verified: `alertPolicies` list is empty).
Those are Phase 14.

Metrics to cover in Phase 14:

| Metric | Source |
| --- | --- |
| Request count, latency (p50/p95/p99), HTTP 4xx/5xx rate | Cloud Run built-in `run.googleapis.com/request_*` |
| Instance count, CPU, memory, cold starts | Cloud Run built-in |
| Worker processing failures, retries, DLQ count | Log-based metrics from structured worker logs |
| Pub/Sub backlog (`num_undelivered_messages`, oldest unacked age) | Pub/Sub built-in |
| Cloud SQL CPU, memory, connections, disk | Cloud SQL built-in |
| Application errors | Error Reporting (from structured ERROR logs) |

## 9. Cloud Run readiness review

Phase 6 review of the source and Dockerfiles; **nothing was deployed.** The six issues it found were fixed on
`fix/cloud-run-readiness` (see the table below), with tests and production-mode smoke checks against the built
API and worker. This supersedes the all-green matrix in `docs/docker/cloud-run-compatibility.md`.

| Check | Result |
| --- | --- |
| Dynamic `PORT` — API | ✅ `process.env.PORT || 3000`, binds `0.0.0.0` |
| Dynamic `PORT` — worker | ✅ fixed (issue 1) |
| Dynamic `PORT` — web | ✅ fixed — nginx listens on `${PORT}` (default 80) |
| SIGTERM | ✅ API disconnects Prisma; worker closes HTTP server, Pub/Sub subscription and Prisma within 8 s (issue 6) |
| Non-root | ✅ `USER node` in API/worker images; nginx master runs as root (acceptable on Cloud Run) |
| Health endpoints | ✅ `/api/v1/health/liveness`, `/api/v1/health` (DB readiness), worker `/health`, web `/health` |
| stdout/stderr logging | ✅ — not yet structured JSON (see §7, Phase 14) |
| No persistent local filesystem | ✅ no file writes |
| Separate API / worker containers | ✅ |
| Config externalised | ✅ secrets fail fast in production (issue 2) |
| Statelessness | ✅ no per-instance state in production (issue 3) |

### Issues found and how they were fixed

| # | Issue | Fix |
| --- | --- | --- |
| 1 | Worker ignored Cloud Run's `PORT` (`HEALTH_PORT=8081` won) | `resolveHttpPort`: `PORT || HEALTH_PORT || 8081`; Docker `HEALTHCHECK` uses the same order |
| 2 | Hardcoded JWT fallback secret | `requiredSecret()`: the API refuses to boot in production without `JWT_ACCESS_SECRET` |
| 3 | Per-instance in-memory state | Production never uses in-memory fallbacks (`useDatabase()` / `rethrowInProduction()` → 503 when the DB fails). Auth rate limiting moved to a shared PostgreSQL fixed-window counter (`AuthRateLimit` table, migration `20261004085326_add_auth_rate_limits`) |
| 4 | Worker used streaming pull (needs always-on CPU) | `PUBSUB_DELIVERY=push`: Pub/Sub POSTs to `/pubsub/push`; OIDC token verified (audience + push service account), mandatory in production; malformed messages are acked and dropped, handler failures return 500 for retry. Pull stays the local default for the emulator |
| 5 | nginx `proxy_pass http://api:3000` breaks on Cloud Run | `apps/web/nginx.conf.template` rendered at start: `listen ${PORT}`, upstream `${API_UPSTREAM}` resolved per request via the container's DNS resolver, `Host $proxy_host` + SNI for `*.run.app` |
| 6 | Shutdown did not release resources; CORS `*` + credentials | API `PrismaShutdownHook`; worker drains with an 8 s cap. CORS from `CORS_ORIGIN` allowlist; `*` rejected in production, unset = same-origin only |

**Found during the fix (security, beyond the original six):** in every environment the API accepted the hardcoded
demo logins (`admin@shopcloud.dev` / `Password123!` → SUPER_ADMIN) whenever the email was not in the users table,
accepted demo JWT subjects without a user row, issued tokens without persisting refresh tokens when the DB failed,
and the cart/orders controllers trusted a client `x-user-id` header. All demo/offline paths are now disabled when
`NODE_ENV=production`, identity comes only from the verified JWT, and the rate limiter no longer trusts the
client-controlled left side of `X-Forwarded-For`.

### Phase 7 runtime configuration

| Service | Variable | Value |
| --- | --- | --- |
| api | `NODE_ENV` | `production` |
| api | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Secret Manager (`shopcloud-dev-jwt-*`) |
| api | `DATABASE_URL` | Secret Manager (Phase 8) |
| api | `CORS_ORIGIN` | unset (web proxies `/api` same-origin) or explicit origins |
| api | `TRUST_PROXY_HOPS` | `1` when clients reach the API directly through Cloud Run's front end. **Decide in Phase 7:** if all traffic arrives via the web container's proxy, each hop (Cloud Run front end → nginx → Cloud Run front end) appends an entry, so the value must match that chain or the limiter keys on the web service's egress address |
| api, worker | `GCP_PROJECT_ID` | `project-c3f386b1-6c37-468d-8ee` (the code still defaults to a non-existent `shopcloud-dev`) |
| web | `API_UPSTREAM` | `https://<shopcloud-api-dev URL>` |
| worker | `PUBSUB_DELIVERY` | `push` |
| worker | `PUBSUB_PUSH_AUDIENCE`, `PUBSUB_PUSH_SERVICE_ACCOUNT` | push endpoint URL and the subscription's push identity (Phase 10) |

The `AuthRateLimit` migration must be applied before the API serves traffic (Phase 8 migrator job).

### Still open (later phases)

- **Event publishing (Phase 10):** `EventsService.publish` logs and continues when Pub/Sub fails, so an order can
  commit without its event. Fix with a transactional outbox once Pub/Sub exists; making it throw now would fail
  every order until then.
- **Structured logging (Phase 14):** JSON logs with `severity` and trace correlation.
- **Seed safety (Phase 8):** the dev seed creates `usr-*-demo` users with a known password; it must never run
  against a non-dev database.

## 10. Terraform strategy

**DEFERRED to Phase 13 — design only.** The repository already contains a scaffold under
`infrastructure/terraform/` (`environments/dev`, `modules/{cloud-run,cloud-sql,iam,monitoring,networking,pubsub,storage}`);
it is not applied anywhere. Phase 13 will keep that location (not `infra/`) and add:

```
infrastructure/terraform/
  bootstrap/            # remote-state bucket (GCS, versioned) — first apply
  modules/
    artifact-registry/  # new
    secret-manager/     # new
    wif/                # new — pool, provider, SA binding
    iam/ cloud-run/ cloud-sql/ storage/ pubsub/ monitoring/ networking/
  environments/
    dev/  staging/  prod/
```

Phase 6 resources were created with gcloud and must be **imported**, not recreated:
the three service accounts, `shopcloud-github-pool`, provider `github-actions`, the deployer IAM binding,
enabled services, and project labels. After import, set `managed-by=terraform`.

## 11. Cost control

Expected cost of Phase 6: **≈ ₹0/month** — an empty Artifact Registry repository, secret containers with no versions,
service accounts, WIF and enabled APIs are all free or within free tiers.

| Area | Strategy |
| --- | --- |
| Region | `asia-south1` only; avoid cross-region egress |
| Cloud Run | `min-instances=0` (scale to zero) for dev; small CPU/memory; request-based billing; max-instances cap |
| Cloud SQL | Smallest shared-core tier (`db-f1-micro` / `db-g1-small` class), 10 GB SSD, no HA, stop instance when idle |
| Storage | Standard class with lifecycle rules (delete temp uploads after N days, Nearline for old media) |
| Pub/Sub | Low volume stays within the free tier; set message retention to the minimum needed; DLQs with retention caps |
| Artifact Registry | Cleanup policy (keep last 10 tags, delete untagged > 7 days); 0.5 GB free tier |
| Logging | Keep 30-day default retention; exclude health-check noise; no sinks to BigQuery |
| Monitoring | Built-in metrics only; few custom/log-based metrics |
| Idle defaults | Unused default APIs (BigQuery, Dataform, …) incur no cost; nothing always-on exists |
| Budget alerts | **PASS** — `shopcloud-dev-monthly`: ₹500/month, calendar month, project-scoped, email alerts at 50/90/100 % of actual spend. Alerts only; it does not cap spending |
