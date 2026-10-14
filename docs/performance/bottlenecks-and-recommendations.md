# ShopCloud — Performance Diagnosis, Bottlenecks & Capacity Analysis

## 1. Executive Summary

During Phase 15 performance baselining, empirical benchmarks revealed multiple critical architectural insights, potential scalability bottlenecks, and cost-neutral optimizations across the API gateway and event-driven worker subsystems.

This document details the observed symptoms, evidence, root-cause analyses, and concrete low-cost remediation recommendations to ensure high throughput and cost predictability as traffic scales.

---

## 2. Empirical Findings & Remediations Applied

### Finding 1: Uncached Role Permission Database Probe on Authenticated Requests

- **Symptom**: Initial cart and order lifecycle benchmarks exhibited a +2,000ms latency floor on every request.
- **Investigation & Evidence**: Profiling the NestJS request lifecycle revealed that `JwtStrategy` invoked `PermissionsService.getPermissionsForRole` on every authenticated request. In `PermissionsService.getPermissionsForRole`, Prisma attempted `prisma.rolePermission.findMany()` directly within a plain try/catch without checking `useDatabase()`. When PostgreSQL was stopped, the Prisma client waited for its internal connection timeout before falling back to static role permissions.
- **Remediation**: Wrapped the database query in `if (await useDatabase())`, which references the 60-second cached connectivity probe in `apps/api/src/db-status.ts`.
- **Measured Impact**: Authenticated cart and order request latency dropped immediately from **~2,800ms to 5.2ms** (over a 500x speedup).

---

### Finding 2: Inconsistent Offline Fallback Declaration in PaymentsService

- **Symptom**: Payment webhook and checkout initiation failed with unhandled Prisma connection errors (`Can't reach database server at 127.0.0.1:5433`).
- **Investigation & Evidence**: `apps/api/src/modules/payments/payments.service.ts` had declared a local dummy function `async function useDatabase()` that checked `NODE_ENV === 'test' && !process.env.DATABASE_URL` instead of importing the centralized `useDatabase` function from `../../db-status`. When running in development mode without a database, the service erroneously attempted to query PostgreSQL for event idempotency (`prisma.processedEvent.findUnique`) and order lookups.
- **Remediation**: Removed the redundant local helper and imported `useDatabase` from `../../db-status`, enabling `PaymentsService`'s built-in in-memory stores (`localPayments`, `localProcessedEvents`).
- **Measured Impact**: Webhook processing latency dropped to **4.05ms** with 100% check pass rate and complete cryptographic verification.

---

### Finding 3: Health Probe Hierarchy & Latency Divergence

- **Observation**:
  - `/api/v1/health` (Readiness Probe): Average latency **~1,010ms** when database is unreachable due to the internal 1,000ms database probe timeout (`DB_PROBE_TIMEOUT_MS = 1000`).
  - `/api/v1/health/liveness` (Liveness Probe): Average latency **4.76ms** (sub-5ms) with zero dependency probing.
- **Architectural Rationale**: This divergence is intentional and represents optimal Cloud Run SRE practice:
  - If Cloud Run used `/api/v1/health` for its container liveness probe, a temporary database outage would cause Cloud Run to restart healthy application containers in a cascading restart loop.
  - By using `/api/v1/health/liveness`, container orchestration remains rock-solid while readiness reflects actual dependency health.
- **Recommendation**: Ensure Terraform Cloud Run service definitions continue pointing `liveness_probe` strictly to `/api/v1/health/liveness`.

---

### Finding 4: Auth Rate Limiting Contention in High-Concurrency Benchmarks

- **Observation**: The platform enforces `AuthRateLimiterGuard` (10 login attempts per 60 seconds per IP). In high-concurrency benchmarks, acquiring JWT tokens inside the virtual-user loop rapidly triggers HTTP 429 Too Many Requests.
- **Remediation**: Codified the session preparation in k6's `setup()` function. Virtual users reuse valid access tokens, eliminating redundant authentication overhead and isolating the measurement of downstream business workflows.

---

## 3. Potential Bottlenecks & Capacity Limitations

```
┌────────────────────────────────────────────────────────────────────────┐
│ Cloud Run API Gateway (Max 10 Instances, Min 0 Instances)              │
│  - Concurrency limit: 80 requests/container                            │
│  - Cold start: ~1.2s to 1.8s (NestJS compilation / module resolution) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
┌──────────────────────────────────┐┌────────────────────────────────────┐
│ Cloud SQL PostgreSQL 16 (Stopped)││ Google Cloud Pub/Sub Topic         │
│  - Max connections: 100 (db-f1)  ││  - shopcloud-domain-events         │
│  - Connection pool per instance: ││  - Async outbox dispatch           │
│    Prisma default (10)           ││  - Push subscription to workers    │
│  - Max instances before pool     ││  - Backlog alert threshold: 100    │
│    saturation: 10 instances      ││  - DLQ threshold: > 0 messages     │
└──────────────────────────────────┘└────────────────────────────────────┘
```

### Bottleneck A: Cloud SQL Connection Pool Exhaustion at High Concurrency
- **Risk**: Cloud SQL `db-f1-micro` or `db-custom-1-3840` allows a finite number of PostgreSQL connections (typically 50–100). With Cloud Run auto-scaling up to 10 instances and each container opening 10 Prisma connections, the database connection limit will be reached during heavy spikes, causing connection timeout errors.
- **Low-Cost Remediation**:
  1. Set `connection_limit=5` in the Prisma database URL query string (`?connection_limit=5&pool_timeout=10`).
  2. Implement pgBouncer or Cloud SQL Auth Proxy with connection pooling in future scale phases.

---

### Bottleneck B: High-Volume Catalog Read Load
- **Risk**: Although in-memory reads complete in ~4ms, database-backed queries for product listings with relations (`category`, `images`) generate multiple SQL joins and sorting operations.
- **Low-Cost Remediation**:
  1. Add HTTP Cache-Control headers to public catalog endpoints:
     `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`
  2. Cloud CDN (or Cloud Run edge caching) can serve cached responses at zero origin compute cost.

---

### Bottleneck C: Pub/Sub Worker Backlog Accumulation
- **Risk**: During sudden transaction spikes, the transactional outbox table accumulates events faster than Cloud Run worker push endpoints acknowledge them.
- **Low-Cost Remediation**:
  1. Push subscriptions have max delivery attempts (5) before routing to Dead Letter Queues (DLQ).
  2. Phase 14 alert policy `pubsub_backlog` triggers if backlog exceeds 100 messages over 10 minutes, notifying operators before customer impact.

---

## 4. Prioritized Recommendations Matrix

| Optimization | Expected Gain | Implementation Effort | GCP Cost Impact |
| :--- | :--- | :--- | :--- |
| **Prisma Pool Capping (`connection_limit=5`)** | Prevents connection exhaustion at 10 Cloud Run instances | 1 line in `.env` | **₹0 (Zero)** |
| **HTTP `Cache-Control` on Catalog** | 80%+ reduction in origin database queries | Low (NestJS Interceptor) | **₹0 (Zero)** |
| **k6 `setup()` Token Caching** | Prevents 429 rate limit triggers in benchmarks | Implemented in Phase 15 | **₹0 (Zero)** |
| **Prisma Offline Probe Caching** | Sub-10ms response when DB is stopped | Implemented in Phase 15 | **₹0 (Zero)** |
| **Cloud Run Min Instances = 0** | Zero idle charges when platform is idle | Codified in Terraform | **₹0 (Preserved)** |
