# ShopCloud — Performance & Load Testing Suite (k6)

Welcome to the **ShopCloud Load & Performance Testing Suite** built using [Grafana k6](https://k6.io/). This suite provides reproducible, isolated, and cost-controlled performance baselining across synchronous REST APIs, state-machine transitions, and asynchronous event-driven webhooks.

---

## 1. Safety & Zero-Cost GCP Policy

> [!IMPORTANT]
> **Strict Cost Guardrails**:
> - **Production Cloud SQL (`shopcloud-postgres`) is intentionally STOPPED (`activationPolicy: NEVER`).** Never start it merely to run a benchmark.
> - Benchmarks default to **local development / isolated test environments** (`http://127.0.0.1:3000`).
> - Tests automatically block heavy stress profiles against live GCP domains (`run.app`, `shopcloud.dev`, `googleusercontent.com`) unless explicit flags (`ALLOW_LIVE_LOAD_TEST=true`) are configured.
> - No billable GCP compute, external load generators, or paid monitoring ingestions are provisioned.

---

## 2. Directory Structure

```
tests/load/
├── k6.config.js               # Centralized configuration, safety validator, and profile definitions
├── index.js                   # Unified scenario runner and composite suite orchestrator
├── validate-scripts.js        # Fast static syntax and export validator for CI pipelines
├── lib/
│   ├── auth.js                # Authenticated session acquisition & Bearer token management
│   ├── data.js                # Seed catalog fixtures, valid DTOs, HMAC-SHA256 test signatures
│   └── thresholds.js          # Calibrated performance thresholds aligned with Phase 14 SLOs
└── scenarios/
    ├── health.js              # Stage A: Safe baseline & high-frequency liveness probes
    ├── catalog.js             # Stage B: Category browsing, pagination, search & detail reads
    ├── cart.js                # Stage C: Authenticated cart operations (Add, Update, Remove)
    ├── checkout.js            # Stage C: Order creation with DTO validation & sandbox payment
    ├── order-lifecycle.js     # Stage C & D: Order state machine transitions & idempotency
    └── event-processing.js    # Stage D: Webhook ingestion, HMAC verification, duplicate idempotency
```

---

## 3. Prerequisites & Installation

### Windows (Winget):
```powershell
winget install --id GrafanaLabs.k6 --accept-source-agreements --accept-package-agreements
```

### macOS (Homebrew):
```bash
brew install k6
```

### Linux (Debian / Ubuntu):
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

---

## 4. Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `BASE_URL` | `http://127.0.0.1:3000` | Target API gateway URL. |
| `PROFILE` | `smoke` | Load profile (`smoke`, `baseline`, `moderate`, `stress`). |
| `SCENARIO` | `smoke` | Scenario selection (`health`, `catalog`, `cart`, `checkout`, `lifecycle`, `events`, `all`). |
| `SHOPCLOUD_TEST_EMAIL` | `customer@shopcloud.dev` | Test customer account email. |
| `SHOPCLOUD_TEST_PASSWORD`| `Password123!` | Test customer account password. |
| `ALLOW_LIVE_LOAD_TEST` | `false` | Must be set to `true` to run moderate profile against live Cloud Run. |
| `ALLOW_STRESS_TEST` | `false` | Must be set to `true` to enable stress profile. |
| `WORKER_BASE_URL` | `""` | Optional worker service URL for health probes. |

---

## 5. Load Profiles & Hard Safety Caps

| Profile | Virtual Users (VUs) | Duration | Pacing | Target Environment |
| :--- | :--- | :--- | :--- | :--- |
| **Smoke** | 1 VU | 30s | Realistic (200ms–500ms) | Local / CI / Pre-deploy sanity |
| **Baseline** | 5 VUs | 2m (20s ramp / 80s steady / 20s down) | Realistic (300ms–700ms) | Local development / Approved test |
| **Moderate** | 10–15 VUs | 3m (30s ramp / 120s steady / 30s down) | Realistic (200ms–500ms) | Requires approval for live run |
| **Stress** | Max 25 VUs | Hard cap 3m | Minimal | Strictly disabled by default |

---

## 6. How to Run Scenarios

### Step 1: Start the Local API Server
```powershell
node apps/api/dist/main.js
# Or in watch mode: npm run dev:api
```

### Step 2: Execute Scenarios

#### Run Health Probes Smoke Test:
```powershell
k6 run tests/load/scenarios/health.js
```

#### Run Catalog Browsing Load Test:
```powershell
k6 run tests/load/scenarios/catalog.js
```

#### Run Authenticated Cart Test:
```powershell
k6 run tests/load/scenarios/cart.js
```

#### Run Authenticated Checkout Workflow:
```powershell
k6 run tests/load/scenarios/checkout.js
```

#### Run Order Lifecycle State Machine Test:
```powershell
k6 run tests/load/scenarios/order-lifecycle.js
```

#### Run Event Webhook & Idempotency Test:
```powershell
k6 run tests/load/scenarios/event-processing.js
```

#### Run Unified Composite Test Runner:
```powershell
# Default smoke suite (Health + Catalog + Webhooks):
k6 run tests/load/index.js

# Baseline profile (5 VUs, 2m):
k6 run -e PROFILE=baseline tests/load/index.js

# Specific scenario via unified runner:
k6 run -e SCENARIO=catalog tests/load/index.js
```

---

## 7. Performance Thresholds & Calibration

The suite calibrates its thresholds directly against Phase 14 Service Level Objectives:
- **API Availability**: `< 1%` error rate on valid HTTP requests (`http_req_failed < 0.01`).
- **High-Frequency Liveness Probe**: P95 `< 150ms` (measured ~4ms).
- **Catalog Browsing**: P95 `< 350ms`, P99 `< 700ms` (measured ~7ms).
- **Cart Operations**: P95 `< 500ms`, P99 `< 1000ms` (measured ~8ms).
- **Order Lifecycle & State Machine**: P95 `< 700ms`, P99 `< 1200ms` (measured ~9ms).
- **Webhook Ingestion**: P95 `< 300ms`, P99 `< 600ms` (measured ~5ms).
