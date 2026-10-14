# ShopCloud Observability & SRE Architecture

## 1. Overview & Architectural Principles

ShopCloud implements production-grade site reliability engineering (SRE) and observability across its distributed e-commerce platform deployed on Google Cloud Platform. The observability architecture provides full-stack visibility across the synchronous REST API Gateway, asynchronous Cloud Pub/Sub worker consumers, and Cloud SQL storage, while strictly adhering to the project's zero-cost cloud mandate (**₹0 / $0 avoidable spend**).

```
                                  ┌────────────────────────┐
                                  │   Web Client Browser   │
                                  └───────────┬────────────┘
                                              │ HTTP + x-correlation-id
                                              ▼
                             ┌──────────────────────────────────┐
                             │       Google Cloud Run API       │
                             │   (NestJS + StructuredLogger)    │
                             └────────────┬─────────────┬───────┘
                                          │             │
                ┌─────────────────────────┘             └─────────────────────────┐
                │ ACID Transaction                              CloudEvent        │
                ▼                                                                 ▼
    ┌──────────────────────┐                                          ┌──────────────────────┐
    │ Google Cloud SQL     │                                          │ Google Cloud Pub/Sub │
    │ (PostgreSQL 16)      │                                          │ (domain-events)      │
    │ activation: NEVER    │                                          └──────────┬───────────┘
    └──────────────────────┘                                                     │
                                                                                 ▼
                                                                      ┌──────────────────────┐
                                                                      │ Background Workers   │
                                                                      │ (Inventory & Notif)  │
                                                                      │ (WorkerLogger JSON)  │
                                                                      └──────────┬───────────┘
                                                                                 │
                                                                                 ▼
                                                                      ┌──────────────────────┐
                                                                      │ Google Cloud Logging │
                                                                      │ & Cloud Monitoring   │
                                                                      └──────────────────────┘
```

The observability architecture adheres to four foundational engineering principles:

1. **Strict Zero-Cost Infrastructure Policy ($0 / ₹0 avoidable spend)**:
   - Built-in Google Cloud platform metrics (`run.googleapis.com/*`, `pubsub.googleapis.com/*`, `cloudsql.googleapis.com/*`) are leveraged exclusively. They are captured automatically by GCP hypervisors without custom metric ingestion fees or memory-heavy agents.
   - High-frequency Cloud Run liveness probes (`/health/liveness`) are filtered to `DEBUG` severity to avoid log volume ingestion charges.
   - Cloud SQL remains stopped (`activationPolicy: NEVER`) during idle periods; observability dashboards and alert policies distinguish planned shutdowns from genuine incidents.
2. **Correlation ID & Context Propagation**:
   - Every incoming HTTP request is assigned a unique `correlationId` via `CorrelationMiddleware` (or preserves client-provided `x-correlation-id` / `x-request-id`).
   - Node.js `AsyncLocalStorage` maintains correlation context throughout async execution chains, attaching it to domain events, database outbox entries, and downstream logs.
   - Workers extract `correlationId` from Pub/Sub CloudEvent envelopes, ensuring end-to-end distributed traceability.
3. **Zero-Leakage Privacy & Data Protection**:
   - Automated deep redaction is applied at the logger level across API and worker processes.
   - Passwords, JWT secrets, database connection URLs, authorization headers, credit card numbers, and raw payment payloads are cryptographically masked before emission.
4. **Actionable, Symptom-Based Alerting**:
   - Alerts trigger on customer-facing symptoms (sustained 5xx rates, high latency, dead-letter accumulation), not transient anomalies.
   - Every alert includes an incident summary, likely causes, and a direct link to the operational runbook.

---

## 2. Structured Logging Pipeline

Both the API Gateway (`apps/api`) and Async Workers (`apps/workers`) emit single-line JSON logs formatted for Google Cloud Logging:

```json
{
  "severity": "INFO",
  "message": "GET /api/v1/products 200 - 12ms",
  "timestamp": "2026-10-14T17:41:43.000Z",
  "service": "shopcloud-api",
  "environment": "production",
  "context": "HttpAccessLog",
  "correlationId": "corr-k78d92a-1728927703",
  "logging.googleapis.com/trace": "projects/project-c3f386b1-6c37-468d-8ee/traces/4bf92f3577b34da6a3ce929d0e0e4736",
  "logging.googleapis.com/spanId": "00f067aa0ba902b7",
  "logging.googleapis.com/trace_sampled": true,
  "httpRequest": {
    "requestMethod": "GET",
    "requestUrl": "/api/v1/products",
    "status": 200,
    "latency": "12ms",
    "userAgent": "Mozilla/5.0 ...",
    "remoteIp": "35.190.247.1"
  }
}
```

### Syslog Severity Mapping
| Log Level | Cloud Logging Severity | Usage in ShopCloud |
| :--- | :--- | :--- |
| `verbose` / `debug` | `DEBUG` | High-frequency container health probes, internal cache lookups (suppressed in production unless `DEBUG=true`). |
| `log` / `info` | `INFO` | Successful HTTP requests, business lifecycle transitions, Pub/Sub message dispatch. |
| `warn` | `WARNING` | Client 4xx validation errors, duplicate event skips, transient retries. |
| `error` | `ERROR` | Unhandled exceptions, database connection drops, Pub/Sub processing failures, 5xx responses. |
| `critical` | `CRITICAL` | Severe system faults requiring immediate on-call intervention. |

---

## 3. Distributed Trace Context & Correlation Propagation

ShopCloud supports native trace correlation without paid third-party APM agents:
1. **Google Cloud Trace Header**: `X-Cloud-Trace-Context: TRACE_ID/SPAN_ID;o=TRACE_TRUE`.
2. **W3C Distributed Tracing Header**: `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`.

When either header is received, `CorrelationMiddleware` parses the `traceId` and formats the special field `logging.googleapis.com/trace: "projects/${PROJECT_ID}/traces/${TRACE_ID}"`. Google Cloud Logging automatically indexes this attribute, allowing one-click cross-navigation between Cloud Logging and Cloud Trace.

```
Incoming Request
  │ (X-Cloud-Trace-Context / x-correlation-id)
  ▼
CorrelationMiddleware
  │ (Stores in AsyncLocalStorage)
  ├─────────────────────────────────────────────────┐
  ▼                                                 ▼
StructuredLoggerService                        EventsService
  │ logging.googleapis.com/trace                 │ EventEnvelope.correlationId
  │ correlationId                                │ CloudEvent.correlationid
  ▼                                                 ▼
Cloud Logging JSON                              Cloud Pub/Sub Message Attributes
                                                    │
                                                    ▼
                                                WorkerLogger
                                                  │ (Extracts correlationId)
                                                  ▼
                                                Cloud Logging Worker JSON
```

---

## 4. Built-in Platform Telemetry & Metrics

ShopCloud utilizes built-in GCP platform metrics that incur **zero ingestion cost**:

| Domain | Metric Type | Description | Unit |
| :--- | :--- | :--- | :--- |
| **Cloud Run** | `run.googleapis.com/request_count` | Number of requests completed by Cloud Run revisions. | Count |
| **Cloud Run** | `run.googleapis.com/request_latencies` | Latency distribution of completed requests (P50, P95, P99). | ms |
| **Cloud Run** | `run.googleapis.com/container/cpu/utilizations` | CPU utilization percentage of container instances. | % |
| **Cloud Run** | `run.googleapis.com/container/memory/utilizations`| Memory allocation percentage. | % |
| **Cloud Run** | `run.googleapis.com/container/instance_count` | Active and idle container instances (verifies scale-to-zero). | Count |
| **Pub/Sub** | `pubsub.googleapis.com/subscription/num_undelivered_messages` | Number of unacknowledged messages waiting in subscription. | Count |
| **Pub/Sub** | `pubsub.googleapis.com/subscription/oldest_unacked_message_age` | Age of oldest unacknowledged message in seconds. | Seconds |
| **Cloud SQL** | `cloudsql.googleapis.com/database/cpu/utilization` | Database CPU utilization (observed during active windows). | % |
| **Cloud SQL** | `cloudsql.googleapis.com/database/network/connections` | Number of open database connections. | Count |

---

## 5. Health Check Hierarchy & Probing Semantics

ShopCloud cleanly decouples **liveness** from **readiness**:

- **Liveness (`/api/v1/health/liveness`, `/health`)**:
  - Purpose: Validates that the Node.js event loop and HTTP server are responsive.
  - Return: `200 OK {"status": "UP"}`.
  - Failure Action: Cloud Run restarts the container instance.
  - Dependency Check: Never checks external dependencies (database, Pub/Sub) to avoid restart cascading storms during temporary cloud outages.
- **Readiness (`/api/v1/health`)**:
  - Purpose: Validates critical operational dependencies (PostgreSQL database connectivity via `SELECT 1`).
  - Return: `200 OK` when healthy; `503 Service Unavailable` when PostgreSQL is unreachable; `200 OK (degraded)` when offline fallback demo mode is active.
