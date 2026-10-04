# Cloud Run Deployment (Phase 7)

ShopCloud's API and web storefront run on Cloud Run in `project-c3f386b1-6c37-468d-8ee` (`asia-south1`).
All values below come from real `gcloud` output on 2026-10-04 — see [validation.md](validation.md#phase-7--cloud-run).

> **Database status: DEFERRED TO PHASE 8.** No Cloud SQL exists yet, so the API runs without `DATABASE_URL`.
> It boots, serves health and enforces authentication, but every database-backed route returns
> `503 DATABASE_UNAVAILABLE` (by design — production never falls back to in-memory demo data).

## 1. Architecture

```
Browser ──HTTPS──▶ shopcloud-web (nginx, Cloud Run)
                     ├── /            static React SPA (try_files → index.html)
                     ├── /assets/*    immutable, 1-year cache
                     └── /api/*  ──HTTPS (Host + SNI)──▶ shopcloud-api (NestJS, Cloud Run)
                                                          ├── /api/v1/health/liveness  (probes)
                                                          ├── /api/v1/health           (readiness report)
                                                          └── /api/v1/*  ── PostgreSQL ✗ (Phase 8)
```

The frontend calls the relative path `/api/v1`, so the browser only ever talks to the web origin (no CORS, no
build-time `VITE_*` values, no API URL in the bundle). nginx forwards `/api/*` to the API's Cloud Run URL,
configured at runtime through `API_UPSTREAM`.

**Worker: DEFERRED (Phase 10).** The worker image supports Pub/Sub push delivery, but no topics or subscriptions
exist, so there is nothing to deliver. Deploying it now would be an idle public endpoint; it is not deployed.

## 2. Services

| | API | Web |
| --- | --- | --- |
| Service | `shopcloud-api` | `shopcloud-web` |
| URL | https://shopcloud-api-24903284190.asia-south1.run.app | https://shopcloud-web-24903284190.asia-south1.run.app |
| Legacy URL (same service) | https://shopcloud-api-2kvnk25flq-el.a.run.app | — |
| Serving revision | `shopcloud-api-00004-rmg` | `shopcloud-web-00001-62k` |
| Image | `…/shopcloud/api@sha256:912f4fd1e8abeca2968be924b3218d8f922a3ff412bc59fbadcfbf7fdbe8cc0b` | `…/shopcloud/web@sha256:9864c076b5cadf64161de1a1980480906944708594fa5e8fe046730a09d1b988` |
| Image tags | `phase7-0fb8b77`, `0fb8b77d077cbab5609946a7e7409357c8b55672` | same |
| Source commit | `0fb8b77` (`fix(docker): copy workspace-local node_modules into runtime images`) | same |
| Runtime identity | `shopcloud-api-runtime@…` | `shopcloud-web-runtime@…` (no roles) |
| Container port | `8080` (`PORT` injected; app reads `process.env.PORT`) | `8080` (`listen ${PORT}` template) |
| CPU / memory | 1 vCPU / 512 MiB | 1 vCPU / 256 MiB |
| Min / max instances | 0 / 2 | 0 / 2 |
| Concurrency | 40 | 80 |
| Request timeout | 30 s | 30 s |
| CPU allocation | request-based (throttled when idle) + startup CPU boost | request-based |
| Startup probe | HTTP `/api/v1/health/liveness`, every 5 s, 24 failures (2 min) | HTTP `/health`, every 3 s, 10 failures |
| Liveness probe | HTTP `/api/v1/health/liveness`, every 30 s, 3 failures | HTTP `/health`, every 30 s, 3 failures |
| Ingress / access | `all`, `allUsers` invoker (public; the app enforces auth) | `all`, `allUsers` invoker |
| Labels | `project=shopcloud, environment=dev, component=api, owner=shopcloud, managed-by=gcloud, git-sha=0fb8b77` | same with `component=web` |

Names follow the Phase 7 brief (`shopcloud-api`, `shopcloud-web`): the project is single-environment (dev), so
an environment suffix would be redundant — the same reasoning as the service accounts.

### Environment

| Service | Variable | Source | Value |
| --- | --- | --- | --- |
| api | `NODE_ENV` | env | `production` (no demo/offline fallbacks) |
| api | `GCP_PROJECT_ID` | env | `project-c3f386b1-6c37-468d-8ee` |
| api | `TRUST_PROXY_HOPS` | env | `1` (see §7) |
| api | `RELEASE` | env | `phase7-0fb8b77` (label used for the rollback test) |
| api | `JWT_ACCESS_SECRET` | **Secret Manager** `shopcloud-dev-jwt-access-secret:2` | pinned version; value never displayed |
| api | `DATABASE_URL` | — | **not set** (Phase 8) |
| web | `API_UPSTREAM` | env | `https://shopcloud-api-24903284190.asia-south1.run.app` (public, non-sensitive) |

`CORS_ORIGIN` is unset on purpose: the browser reaches the API same-origin through the web proxy, so the API
grants no cross-origin access (verified: a foreign `Origin` receives no `Access-Control-Allow-Origin`).

## 3. Scaling & cost

Both services scale to zero (`min-instances=0`) and bill CPU only while handling requests, so idle cost is ₹0.
`max-instances=2` caps worst-case spend. Expected usage for a portfolio demo stays inside the Cloud Run free tier
(2M requests, 180k vCPU-s, 360k GiB-s per month). Trade-off: the first request after idle pays a cold start
(not yet measured; startup CPU boost is enabled to shorten it — Phase 15 load testing will quantify it).
Artifact Registry holds 165 MB after the Phase 7 builds (shared layers deduplicate; under the 0.5 GB free tier);
the cleanup policy from Phase 6 bounds growth.

## 4. IAM

| Identity | Roles | Why |
| --- | --- | --- |
| `shopcloud-api-runtime` | `secretmanager.secretAccessor` on `shopcloud-dev-jwt-access-secret` (+ the two empty containers from Phase 6) | Cloud Run resolves the secret as the runtime identity |
| `shopcloud-web-runtime` (new) | **none** | nginx serves files and proxies over public HTTPS; needs no Google APIs |
| `allUsers` | `run.invoker` on `shopcloud-api` and `shopcloud-web` | public HTTP endpoints; protected routes require a JWT |
| `24903284190-compute@developer…` | **none** | created automatically when Cloud Run was enabled; the org policy `iam.automaticIamGrantsForDefaultServiceAccounts` is enforced, so it received no Editor grant. ShopCloud never runs as it |
| Google service agents | `run.serviceAgent`, `containerregistry.ServiceAgent`, `pubsub.serviceAgent`, `artifactregistry.serviceAgent` | managed by Google (image pulls, platform operations) |

No runtime identity has Cloud SQL, Storage or Pub/Sub permissions — those are granted in their phases.
Deployment in Phase 7 is manual by the project owner; the GitHub deployer only pushes images.

## 5. Secrets

| Secret | Versions | Used by | Notes |
| --- | --- | --- | --- |
| `shopcloud-dev-jwt-access-secret` | `2` enabled, `1` destroyed | api (`:2`) | 64-char random value generated with `openssl rand -base64 48` and piped straight into Secret Manager. Version 1 had a stray carriage return from Windows `openssl` output; it never served traffic and was destroyed |
| `shopcloud-dev-jwt-refresh-secret` | none | — | **Not needed:** refresh tokens are random opaque values stored as SHA-256 hashes; no code reads `JWT_REFRESH_SECRET` |
| `shopcloud-dev-database-url` | none | — | Phase 8 (a secret reference without a version would fail deployment, so it is not mounted yet) |

Secrets never appear in Dockerfiles, git, workflow YAML, command arguments or these docs: Cloud Run references
them by name and version (`--set-secrets=JWT_ACCESS_SECRET=shopcloud-dev-jwt-access-secret:2`).

Rotation: `openssl rand -base64 48 | tr -d '\r\n' | gcloud secrets versions add shopcloud-dev-jwt-access-secret --data-file=-`,
then redeploy with the new version number (all existing access tokens become invalid; refresh tokens are unaffected).

## 6. Health checks

| Endpoint | Purpose | Deployed behaviour |
| --- | --- | --- |
| `GET /api/v1/health/liveness` | Cloud Run startup + liveness probes; no dependencies | `200 {"status":"UP"}` |
| `GET /api/v1/health` | Readiness report (real `SELECT 1` with latency) | `503`, `database: unhealthy — PostgreSQL unreachable` until Phase 8 |
| `GET /health` (web) | Cloud Run probes for nginx | `200 {"status":"UP","service":"shopcloud-web"}` |

Probes deliberately use liveness, not readiness: a database outage must return 503s, not restart containers in a loop.
Phase 7 also replaced the previous health report, which claimed every dependency was "healthy" without checking.

## 7. Networking

| | Setting |
| --- | --- |
| Ingress | `all` on both services (public `*.run.app` HTTPS URLs) |
| Egress | default Cloud Run egress to the internet (web → API over public HTTPS) — no VPC |
| HTTPS | Google-managed TLS; plain `http://` returns `302` to `https://` (verified) |
| Custom domain | not configured (optional future work: Cloud Run domain mapping or a global load balancer) |

**Client IP for rate limiting (`TRUST_PROXY_HOPS=1`):** each proxy appends to `X-Forwarded-For`. With `1`, the
API uses the address appended by Cloud Run's front end — correct for direct API calls and never spoofable. For
traffic through the web proxy that address is the web service's egress IP, so web users share the auth rate-limit
bucket. That is the safe failure mode (stricter, not bypassable). Phase 8 removes the ambiguity: once a VPC exists,
the API can take `internal` ingress, be reached only through the web service via Direct VPC egress, and the hop
count becomes fixed.

**Phase 8 networking requirements:** Cloud SQL (PostgreSQL 16) reachable from the API — either the Cloud SQL
connector/Auth Proxy over the public IP with IAM, or private IP via Direct VPC egress (no Serverless VPC Access
connector, which costs ≈ ₹1,000/month). The API runtime will need `roles/cloudsql.client`.

## 8. Deployment process (manual until Phase 12)

1. **Build & push images** — GitHub Actions `Build & Push Images` (`.github/workflows/build-images.yml`)
   authenticates through WIF as `shopcloud-github-deployer`, builds `Dockerfile.api` / `Dockerfile.web`, pushes
   `phase7-<sha7>` and full-SHA tags (never `latest`) and records the digest. Triggers: manual dispatch, or changes
   to the workflow file or those Dockerfiles. It does **not** deploy.
2. **Deploy by digest** (owner, PowerShell — Git Bash rewrites `/api/...` probe paths into Windows paths):

   ```powershell
   $P = 'project-c3f386b1-6c37-468d-8ee'
   gcloud run deploy shopcloud-api --region=asia-south1 `
     --image="asia-south1-docker.pkg.dev/$P/shopcloud/api@sha256:<digest>" `
     --service-account="shopcloud-api-runtime@$P.iam.gserviceaccount.com" `
     --cpu=1 --memory=512Mi --min-instances=0 --max-instances=2 --concurrency=40 --timeout=30s --cpu-boost `
     --set-env-vars="NODE_ENV=production,GCP_PROJECT_ID=$P,TRUST_PROXY_HOPS=1" `
     --set-secrets="JWT_ACCESS_SECRET=shopcloud-dev-jwt-access-secret:2" `
     --startup-probe="httpGet.path=/api/v1/health/liveness,periodSeconds=5,timeoutSeconds=3,failureThreshold=24" `
     --liveness-probe="httpGet.path=/api/v1/health/liveness,periodSeconds=30,timeoutSeconds=3,failureThreshold=3" `
     --ingress=all --allow-unauthenticated

   gcloud run deploy shopcloud-web --region=asia-south1 `
     --image="asia-south1-docker.pkg.dev/$P/shopcloud/web@sha256:<digest>" `
     --service-account="shopcloud-web-runtime@$P.iam.gserviceaccount.com" `
     --port=8080 --cpu=1 --memory=256Mi --min-instances=0 --max-instances=2 --concurrency=80 --timeout=30s `
     --set-env-vars="API_UPSTREAM=https://shopcloud-api-24903284190.asia-south1.run.app" `
     --startup-probe="httpGet.path=/health,periodSeconds=3,timeoutSeconds=2,failureThreshold=10" `
     --liveness-probe="httpGet.path=/health,periodSeconds=30,timeoutSeconds=2,failureThreshold=3" `
     --ingress=all --allow-unauthenticated
   ```
3. **Smoke test** the URLs (see [validation.md](validation.md#phase-7--cloud-run)).

## 9. Revisions & rollback

| Revision | Image | Status |
| --- | --- | --- |
| `shopcloud-api-00001-jg6` | `api@sha256:74fb1997…` (`60322be`) | **failed** — `Cannot find module 'dotenv'` (fixed in `0fb8b77`). Never served traffic |
| `shopcloud-api-00002-wvs` | `api@sha256:912f4fd1…` | **failed** — probe path mangled by Git Bash into `C:/Program Files/Git/api/...`. Never served traffic |
| `shopcloud-api-00003-dgn` | `api@sha256:912f4fd1…` | healthy (rollback target) |
| `shopcloud-api-00004-rmg` | `api@sha256:912f4fd1…` + `RELEASE` env | **serving 100 %** |
| `shopcloud-web-00001-62k` | `web@sha256:9864c076…` | **serving 100 %** |

Do not route traffic to 00001 or 00002. Rollback was exercised safely (identical image):

```powershell
gcloud run services update-traffic shopcloud-api --region=asia-south1 --to-revisions=shopcloud-api-00003-dgn=100   # rollback → liveness 200
gcloud run services update-traffic shopcloud-api --region=asia-south1 --to-latest                                 # roll forward → liveness 200
```

## 10. Logging

Cloud Logging receives, per service: request logs (`run.googleapis.com/requests`: method, URL, status, latency),
application stdout/stderr, and platform system logs. A scan of the last hour of logs for both services found no
JWTs, passwords, `Authorization` headers, secret values or connection strings. Application logs are still plain
text without `severity` (structured JSON logging is Phase 14).

## 11. Limitations (Phase 7)

| Item | Status |
| --- | --- |
| Database-backed functionality (catalog, auth login/register, cart, orders, admin) | **DEFERRED TO PHASE 8** — returns 503 |
| Authenticated request flow end-to-end | **DEFERRED TO PHASE 8** (no users can log in without the database) |
| Worker service | **DEFERRED TO PHASE 10** |
| Storefront UX with the database down | shows empty product placeholders rather than an error message |
| Swagger UI (`/api/docs`) | public; documents the API surface (acceptable for a portfolio API) |
| Auth rate limiting through the web proxy | shared bucket (safe), see §7 |
| CD workflow (`deploy.yml`) | still targets `shopcloud-dev-api` / `workers`; aligned in Phase 12 |
| Custom domain | not configured |
