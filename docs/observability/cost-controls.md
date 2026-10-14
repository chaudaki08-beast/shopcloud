# ShopCloud Observability Cost Controls & Free Tier Optimization

## 1. Zero-Cost Policy Compliance ($0 / ₹0 Spend Target)

ShopCloud operates under an absolute zero-cost cloud mandate: avoid all non-essential cloud expenditures while maintaining production-grade reliability and architectural rigour.

Observability and telemetry in cloud environments can become major cost drivers if left unmanaged (e.g. high-frequency log ingestion, high-cardinality custom metrics, external APM agent licensing, uncompressed trace sampling).

This document details the cost analysis, free-tier guardrails, and architectural suppression strategies implemented in Phase 14.

---

## 2. Google Cloud Observability Free-Tier Allowances

Google Cloud provides generous monthly free-tier allowances for native observability services:

| GCP Service | Free Tier Monthly Allowance | ShopCloud Consumption Profile | Billable Risk |
| :--- | :--- | :--- | :--- |
| **Cloud Logging** | **50 GiB** per project / month | ~0.05 GiB / month (compact JSON, suppressed probes) | **$0** (well below 0.1% of free quota) |
| **Cloud Monitoring Metrics** | Built-in platform metrics are **FREE**.<br>All non-custom metrics incur no charges. | Exclusively uses built-in metrics (`run.googleapis.com/*`, `pubsub.googleapis.com/*`). | **$0** (zero custom metric ingestion fees) |
| **Cloud Monitoring Dashboards** | **FREE** (no charge for dashboard definitions or views) | 1 operational dashboard managed via Terraform. | **$0** |
| **Cloud Monitoring Alerts** | Built-in metric alert evaluation is **FREE**. | 4 symptom-based alert policies. | **$0** |
| **Cloud Trace** | **2,500,000** spans ingested / month | Log-linked trace correlation without paid external agents. | **$0** |
| **Cloud Pub/Sub** | **10 GiB** message ingestion / month | Bounded event stream (~1 MiB / month). | **$0** |

---

## 3. Log Volume Optimization & Noise Suppression

To prevent log volume bloat and ensure ingestion remains far below the 50 GiB free quota:

### 3.1 Health Probe Severity Downgrading
Cloud Run issues liveness probes every 10 seconds against each running container instance. In a busy cluster, logging every probe at `INFO` generates over 250,000 log lines per month of low-value noise.

**Optimization**:
In `HttpLoggingInterceptor`, requests matching `/health` or `/liveness` are automatically classified as `DEBUG`. Because `StructuredLoggerService` ignores `DEBUG` severity in production (unless explicitly enabled via `DEBUG=true`), health probe access logs are not ingested into Cloud Logging, completely eliminating probe log bloat.

### 3.2 Bounded Error Stacks
Standard Node.js error dumps often contain 20–50 stack frames, recursive exception chains, and duplicated traces.
ShopCloud truncates error stack traces to the top 5 relevant frames:
```typescript
error.stack.split('\n').slice(0, 5).join('\n')
```

### 3.3 Elimination of Sensitive Request/Response Payloads
Full HTTP request bodies and database query results are never serialized into log records. Logs record only bounded metadata (`messageId`, `orderId`, `status`, `durationMs`), keeping average log payload size under 350 bytes.

---

## 4. Platform vs. Custom Metrics Architectural Decision

### Why Custom Metrics Were Avoided:
Google Cloud charges $0.2580 per megabyte for custom metric ingestion and $0.01 per metric per month beyond free allowances. Creating high-cardinality custom metrics (e.g. labeling metrics with `orderId` or `userId`) can rapidly generate hundreds of thousands of active time series, resulting in unexpected monthly bills.

### ShopCloud Design Decision:
All operational dashboards and alerting policies strictly utilize native Google Cloud hypervisor metrics:
- `run.googleapis.com/request_count`
- `run.googleapis.com/request_latencies`
- `run.googleapis.com/container/cpu/utilizations`
- `pubsub.googleapis.com/subscription/num_undelivered_messages`

These metrics are collected automatically at the infrastructure layer without custom agents, application overhead, or ingestion fees.

---

## 5. Billing Verification Checklist

Before and after deploying Phase 14:
- [x] Billing account `019096-A2B4E0-C3697C` verified active and linked to `project-c3f386b1-6c37-468d-8ee`.
- [x] Cloud SQL instance `shopcloud-postgres` verified `STOPPED` with `activationPolicy: NEVER`.
- [x] Zero billable VPC Access Connectors or Cloud NAT Gateways created.
- [x] Zero paid external monitoring integrations (e.g. PagerDuty, Datadog) provisioned.
- [x] Notification channels list set to `[]` to prevent external SMS charges.
- [x] Cloud Run min instances set to `0` across all services (scale-to-zero).
