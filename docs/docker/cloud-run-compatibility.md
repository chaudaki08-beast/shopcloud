# ShopCloud — Google Cloud Run Compatibility Assessment

This document assesses the ShopCloud container architecture against the official Google Cloud Run container runtime contract and requirements.

> **Superseded in part (Phase 6):** the Phase 6 readiness review found six issues this matrix missed (worker port,
> JWT fallback secret, in-memory state, pull subscriber, nginx upstream, shutdown cleanup); all six are now fixed. The actual GCP project is
> `project-c3f386b1-6c37-468d-8ee` and the registry is `asia-south1-docker.pkg.dev/project-c3f386b1-6c37-468d-8ee/shopcloud`.
> See [docs/gcp/foundation.md §9](../gcp/foundation.md#9-cloud-run-readiness-review).

---

## 1. Cloud Run Container Contract Compliance Matrix

| Requirement | GCP Cloud Run Specification | ShopCloud Implementation | Compliance Status |
| :--- | :--- | :--- | :---: |
| **Port Binding** | Must listen on port specified by `$PORT` env var (defaults to `8080` in Cloud Run). | In [`main.ts`](file:///c:/Ganesh/Project/shopcloud/apps/api/src/main.ts): `const port = process.env.PORT \|\| 3000; await app.listen(port, '0.0.0.0');`. Binds to all network interfaces. | ✅ **COMPLIANT** |
| **Statelessness** | Local filesystem is ephemeral (in-memory tmpfs); no durable local disk storage. | Zero local disk writes for application state. All transactional data is persisted in PostgreSQL; audit logs in database; media will stream to Google Cloud Storage (GCS) in Phase 9. | ✅ **COMPLIANT** |
| **Logging (stdout/stderr)** | Cloud Logging automatically ingests `stdout` (INFO) and `stderr` (ERROR) from containers. | All logging across API and Workers routes directly to `process.stdout` and `process.stderr` using NestJS `Logger` and structured console output. No container-local log files. | ✅ **COMPLIANT** |
| **Graceful Shutdown** | Cloud Run sends `SIGTERM` with a 10-second timeout before issuing `SIGKILL`. | API enables NestJS shutdown hooks (`app.enableShutdownHooks()`). Worker explicitly traps `process.on('SIGTERM')` and `process.on('SIGINT')` to drain connections cleanly. | ✅ **COMPLIANT** |
| **Liveness & Readiness Probes**| Cloud Run HTTP health check probes verify container startup and liveness. | Dedicated endpoints provided: `/api/v1/health/liveness` (instant `200 UP`), `/api/v1/health` (database readiness check), and `/health` on web and worker. | ✅ **COMPLIANT** |
| **Security: Non-Root User** | Running as root is discouraged for container security and least privilege. | `Dockerfile.api` and `Dockerfile.worker` drop root privileges via `USER node` (UID 1000). | ✅ **COMPLIANT** |
| **Secret Management** | Credentials must never be baked into container image layers. | All secrets (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) are externalized via environment variables, ready for direct Google Secret Manager mounting. | ✅ **COMPLIANT** |
| **Architecture & Base OS** | Linux x86_64 container images (Debian/Ubuntu/Alpine). | Standard `node:22-bookworm-slim` multi-stage build. Debian Bookworm provides 100% ABI compatibility with Google Cloud Run kernel. | ✅ **COMPLIANT** |

---

## 2. Service-by-Service Cloud Run Mapping

### 2.1 ShopCloud API (`shopcloud-api`)
* **Future Deployment Target:** Google Cloud Run Service (v2).
* **Scaling Characteristics:** Concurrency: 80, Min instances: 0 (or 1 for zero cold-start in production), Max instances: 10.
* **Database Access:** Private IP connection to Google Cloud SQL (PostgreSQL 16) via Serverless VPC Access Connector (`vpc-connector-asia-south1`).
* **Startup Behavior:** Immediate application startup without running destructive migrations. Migrations are executed via dedicated Cloud Run Jobs.

### 2.2 ShopCloud Workers (`shopcloud-workers`)
* **Future Deployment Target:** Google Cloud Run Service (push event subscriber) or Cloud Run Job (batch consumer).
* **Health Monitoring:** Exposes a lightweight internal HTTP health probe on `process.env.HEALTH_PORT || 8081` (`/health`), satisfying Cloud Run's required HTTP ingress probe.
* **Pub/Sub Integration:** Consumes events from Cloud Pub/Sub subscriptions with exponential backoff and Dead-Letter Topics (DLQ).

### 2.3 ShopCloud Web Storefront (`shopcloud-web`)
* **Future Deployment Target:** Google Cloud Run Service or Firebase App Hosting / Cloud Storage + Cloud CDN.
* **Serving Layer:** Nginx Alpine serving pre-compiled static production assets.
* **Client-Side Routing:** `try_files $uri $uri/ /index.html;` ensures seamless client-side SPA route transitions.
* **API Proxying:** Reverse proxies `/api/` requests to the API Gateway.

---

## 3. Preparation for Phase 6 & Phase 7

1. **No GCP Infrastructure Deployed in Phase 5:** In strict accordance with the project roadmap, no Cloud Run services, Cloud SQL instances, or GCP resources have been provisioned in Phase 5.
2. **Container Image Readiness:** All Dockerfiles (`Dockerfile.api`, `Dockerfile.web`, `Dockerfile.worker`) are completely prepared to be tagged and pushed to Google Artifact Registry (`asia-south1-docker.pkg.dev/shopcloud-dev/shopcloud-repo/*`) in Phase 7.
