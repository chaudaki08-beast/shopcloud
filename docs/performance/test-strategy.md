# ShopCloud — Performance Testing Strategy & Execution Framework

## 1. Executive Summary & Goals

This document outlines the performance engineering strategy for the **ShopCloud** cloud-native e-commerce platform. The objective of Phase 15 is to establish reproducible performance baselines, validate application behavior and state-machine integrity under controlled concurrency, and identify architectural bottlenecks and capacity boundaries without violating the **zero-avoidable-cost GCP policy**.

---

## 2. Mandatory Safety & Cost Controls

1. **Production Cloud SQL Remains Stopped**: The managed Cloud SQL PostgreSQL instance (`shopcloud-postgres`) is intentionally kept in the `STOPPED` state (`activationPolicy: NEVER`). Performance testing must never restart production Cloud SQL merely to run benchmark suites.
2. **Local & Isolated Execution**: All primary load testing and baselining execute against local development or dedicated isolated environments (`http://127.0.0.1:3000`) where database-less fallback or local PostgreSQL is active.
3. **Guardrails on Cloud Endpoints**: The configuration module (`tests/load/k6.config.js`) enforces strict runtime verification. If `BASE_URL` matches a GCP domain (`run.app`, `shopcloud.dev`), the stress profile is immediately blocked, and moderate profiles require explicit user opt-in (`ALLOW_LIVE_LOAD_TEST=true`).
4. **No Billable Infrastructure**: No external distributed load generators, auto-scaling compute pools, or third-party monitoring subscriptions are provisioned.
5. **No Production Mutation**: No live customer orders, real payment gateway transactions, or customer SMS/email notifications are generated during benchmarks.

---

## 3. Workload Modeling & User Journeys

The testing suite defines four realistic e-commerce customer journeys:

```
┌────────────────────────────────────────────────────────┐
│ User Journey 1: Anonymous Catalog Browsing             │
│  1. Category Taxonomy (GET /api/v1/products/categories)│
│  2. Paginated Catalog (GET /api/v1/products?page=1)   │
│  3. Filtered Search (GET /api/v1/products?categoryId=X)│
│  4. Product Detail (GET /api/v1/products/:id)         │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ User Journey 2: Authenticated Cart Mutations           │
│  1. Retrieve Cart (GET /api/v1/cart)                   │
│  2. Add Product (POST /api/v1/cart/items)              │
│  3. Update Quantity (PATCH /api/v1/cart/items/:id)     │
│  4. Remove / Clear Item (DELETE /api/v1/cart/items/:id)│
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ User Journey 3: Checkout & Order State Machine         │
│  1. Submit Order (POST /api/v1/orders)                 │
│  2. Verify Financial Calculations (Totals, Discounts)  │
│  3. Verify Customer Ownership (GET /api/v1/orders/:id) │
│  4. Cancellation (POST /api/v1/orders/:id/cancel)      │
│  5. Invariant: Idempotent Re-cancellation              │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ User Journey 4: Asynchronous Webhooks & Workers        │
│  1. HMAC-SHA256 Signed Inbound Webhook                 │
│  2. Invariant: Duplicate Event Idempotency Check       │
│  3. Security: Forged Signature Rejection (401)         │
│  4. Worker Health & Event Queue Validation             │
└────────────────────────────────────────────────────────┘
```

---

## 4. Load Profiles & Concurrency Limits

| Profile | Virtual Users (VUs) | Target Duration | Purpose & Frequency |
| :--- | :--- | :--- | :--- |
| **Profile 1: Smoke** | 1 VU | 30 seconds | Fast validation on pull requests, local pre-commit checks, and container smoke verification. Minimal request rate. |
| **Profile 2: Baseline** | 5 VUs | 2 minutes (20s warm-up, 80s steady, 20s ramp-down) | Primary reference benchmark for measuring throughput, latency percentiles, and resource utilization. |
| **Profile 3: Moderate** | 10–15 VUs | 3 minutes (30s warm-up, 120s steady, 30s ramp-down) | Concurrency saturation check. Strictly limited to local or explicitly approved staging environments. |
| **Profile 4: Stress** | Up to 25 VUs (Hard Cap) | 3 minutes | Disabled by default. Requires `ALLOW_STRESS_TEST=true`. Never run against production. |

---

## 5. Metrics, Percentiles & SLO Alignment

In accordance with Phase 14 Service Level Objectives:

| Metric | Target / SLO Threshold | Diagnostic Impact |
| :--- | :--- | :--- |
| **API Availability** | `http_req_failed < 0.01` (99% success) | Validates non-5xx availability. Negative security tests (e.g. 401 forged signatures) are excluded using `responseCallback`. |
| **Liveness Latency** | P95 `<= 150ms` | High-frequency container health probes must never degrade. |
| **Catalog Read Latency**| P95 `<= 350ms`, P99 `<= 700ms` | Ensures fast search, category browsing, and detail page rendering. |
| **Cart Operations** | P95 `<= 500ms`, P99 `<= 1000ms` | Authoritative server-side cart calculations and mutations. |
| **Order Placement** | P95 `<= 800ms`, P99 `<= 1500ms` | Atomic order reservation and financial calculations. |
| **Webhook Processing** | P95 `<= 300ms`, P99 `<= 600ms` | Inbound payment webhook acknowledgement and idempotency lookup. |

---

## 6. Authentication Handling & Rate Limit Protection

ShopCloud implements `AuthRateLimiterGuard` (10 requests/minute per IP) on `/api/v1/auth/login`. In load testing, obtaining access tokens on every iteration would rapidly saturate the rate limiter and trigger HTTP 429 Too Many Requests.

**Remediation Strategy**:
- Scenarios use k6's `setup()` lifecycle function to acquire the session JWT **once** before virtual users start.
- Tokens are passed safely into scenario iterations via the data context.
- Sensitive credentials and tokens are strictly excluded from console logs, test output files, and metrics.
- Pacing (`sleep(0.2 - 0.5s)`) is inserted between user actions to replicate authentic human navigation and avoid artificial connection thrashing.

---

## 7. CI/CD Integration Architecture

A lightweight static validation script (`tests/load/validate-scripts.js`) is integrated into the automated GitHub Actions CI pipeline:
- Validates ES module syntax across all scenario files.
- Ensures all mandatory scenarios export `options` and `default function`.
- Confirms correlation ID propagation (`x-correlation-id`) across all request builders.
- Runs without requiring a live k6 binary or paid GCP compute runners.
