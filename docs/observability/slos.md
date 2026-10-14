# ShopCloud Service Level Objectives (SLOs) & Service Health

## 1. Overview & Framework

ShopCloud defines practical, measurable Service Level Indicators (SLIs) and Service Level Objectives (SLOs) covering its synchronous API Gateway, transactional checkout, asynchronous event processing pipeline, and payment webhook integrations.

The objectives are structured around user happiness and business impact, while acknowledging the operational realities of a serverless, scale-to-zero development environment.

---

## 2. Service Level Objectives Summary Table

| Service / Domain | SLO Name | Target | SLI Window | Primary Telemetry Source |
| :--- | :--- | :--- | :--- | :--- |
| **API Gateway** | **API Availability** | **99.5%** | Rolling 30 Days | `run.googleapis.com/request_count` |
| **API Gateway** | **API P95 Latency** | **95.0% <= 500ms** | Rolling 30 Days | `run.googleapis.com/request_latencies` |
| **Event Workers** | **Event Processing Success** | **99.9%** | Rolling 30 Days | Pub/Sub subscription metrics & `WorkerLogger` |
| **Payments** | **Webhook Processing Reliability**| **99.9%** | Rolling 30 Days | `payments.service` structured access logs |

---

## 3. Detailed SLO Specifications

### 3.1 API Availability SLO
- **Target**: **99.5%** of eligible HTTP requests return non-5xx responses over a rolling 30-day window.
- **SLI Formula**:
  $$\text{SLI} = \frac{\text{Count of Eligible Requests with Status } < 500}{\text{Total Count of Eligible Requests}} \times 100$$
- **Numerator**: Sum of all HTTP requests returning status `2xx`, `3xx`, and `4xx` (client errors).
- **Denominator**: Total HTTP requests completed by Cloud Run API service (`shopcloud-api`).
- **Exclusions**:
  - Internal synthetic health check probes (`/api/v1/health/liveness`) are excluded to prevent probe volume from masking customer experience.
  - Authorized database maintenance windows where Cloud SQL is intentionally stopped for cost control.
- **Error Budget**: **0.5%** over 30 days (equivalent to ~3.6 hours of permitted downtime at constant load).

### 3.2 API P95 Latency SLO
- **Target**: **95.0%** of eligible HTTP requests are completed within **500 ms** over a rolling 30-day window.
- **SLI Formula**:
  $$\text{SLI} = \frac{\text{Count of Eligible Requests with Latency } \le 500\text{ ms}}{\text{Total Count of Eligible Requests}} \times 100$$
- **Numerator**: HTTP requests completing in $\le 500\text{ ms}$.
- **Denominator**: Total eligible HTTP requests completed by `shopcloud-api`.
- **Exclusions**:
  - Image multipart file uploads (`POST /api/v1/products/:id/images`), which depend on client uplink bandwidth and GCS streaming.
  - Health check probes (`/api/v1/health`).
- **Rationale**: 500ms represents the upper threshold of responsive interactive web browsing before user abandonment increases.

### 3.3 Asynchronous Event Processing Success SLO
- **Target**: **99.9%** of domain events published to Pub/Sub are successfully processed by worker consumers without landing in a Dead-Letter Queue (DLQ).
- **SLI Formula**:
  $$\text{SLI} = \left( 1 - \frac{\text{Total Messages Delivered to DLQ}}{\text{Total Domain Events Published}} \right) \times 100$$
- **Numerator**: Total messages delivered to DLQ topics (`shopcloud-inventory-dlq`, `shopcloud-notification-dlq`).
- **Denominator**: Total messages published to `shopcloud-domain-events`.
- **Exclusions**:
  - Synthetic stress tests deliberately injecting malformed payloads during chaos drills.
- **Rationale**: In an event-driven architecture, DLQ messages represent lost sales, missing notifications, or stock inconsistencies requiring manual intervention.

### 3.4 Payment Webhook Processing Reliability SLO
- **Target**: **99.9%** of cryptographically valid payment webhooks are processed and acknowledged (HTTP 2xx) within **5 seconds** without state machine corruption.
- **SLI Formula**:
  $$\text{SLI} = \frac{\text{Count of Valid Webhooks Acknowledged } \le 5\text{s with Success or Idempotent Skip}}{\text{Total Count of Valid Webhooks Received}} \times 100$$
- **Exclusions**:
  - Webhooks failing HMAC-SHA256 signature verification (rejected immediately with HTTP 400).
- **Rationale**: Payment providers (Stripe, Razorpay) initiate automated exponential retry storms and potentially disable webhooks if endpoints fail to acknowledge valid events within 5 seconds.

---

## 4. Telemetry Limitations & Sample Size Caveats

In a low-traffic development or portfolio project:
1. **Low Request Volume Impact**: If only 50 requests occur in a day, a single 500 error drops availability to 98.0%, superficially violating the 99.5% SLO despite 49 successful interactions.
2. **Cold Starts**: Scale-to-zero serverless containers incur an initial 1.5s–2.5s container startup penalty when scaling from 0 to 1 instance. P95 latency metrics will reflect cold starts during sporadic test runs.
3. **Intentional Shutdowns**: Cloud SQL is deliberately held in `STOPPED` state to adhere to the zero-cost policy. Readiness probes will accurately report 503 during stopped states; this is documented as expected behavior and does not represent an unplanned incident.
