# ShopCloud Incident Response & Operational Runbooks

## 1. Investigating API 5xx Spikes

### Symptoms
- Cloud Monitoring alert: `ShopCloud - Sustained 5xx Server Errors (dev)` triggers.
- HTTP clients receive status 500 or 503.

### Investigation Steps
1. **Query Cloud Logging for 5xx Error Entries**:
   Filter logs in Google Cloud Logging console or CLI:
   ```bash
   gcloud logging read \
     'resource.type="cloud_run_revision" AND resource.labels.service_name="shopcloud-api" AND severity>=ERROR' \
     --project=project-c3f386b1-6c37-468d-8ee \
     --limit=20 \
     --format="json(timestamp,jsonPayload.correlationId,jsonPayload.message,jsonPayload.error)"
   ```
2. **Inspect the Correlation ID**:
   Extract `correlationId` from the error log and query all logs sharing that ID to trace the exact request path:
   ```bash
   gcloud logging read \
     'jsonPayload.correlationId="<CORRELATION_ID>"' \
     --project=project-c3f386b1-6c37-468d-8ee \
     --format="table(timestamp,severity,jsonPayload.context,jsonPayload.message)"
   ```
3. **Verify Cloud SQL Instance State**:
   ```bash
   gcloud sql instances describe shopcloud-postgres \
     --project=project-c3f386b1-6c37-468d-8ee \
     --format="value(state,settings.activationPolicy)"
   ```
   - If `state=STOPPED` and `activationPolicy=NEVER`: Check if database is intentionally stopped for zero-cost controls. If a live test is running, start Cloud SQL:
     ```bash
     gcloud sql instances patch shopcloud-postgres --activation-policy=ALWAYS
     ```
   - If `state=RUNNING`: Check connection pool exhaustion or query lock timeouts in PostgreSQL logs.

---

## 2. Diagnosing Slow Requests & High Latency

### Symptoms
- Cloud Monitoring alert: `ShopCloud - High Request Latency P95 (dev)` triggers.
- P95 response latency exceeds 1.5s.

### Investigation Steps
1. **Identify Slow Endpoints**:
   Query Cloud Logging access logs with latency > 1,000ms:
   ```bash
   gcloud logging read \
     'resource.type="cloud_run_revision" AND jsonPayload.context="HttpAccessLog"' \
     --project=project-c3f386b1-6c37-468d-8ee \
     --limit=20 \
     --format="table(timestamp,jsonPayload.httpRequest.requestMethod,jsonPayload.httpRequest.requestUrl,jsonPayload.httpRequest.latency)"
   ```
2. **Check Container Auto-Scaling & Throttling**:
   - Check if latency spikes coincide with container cold starts (`instance_count` transitioning from 0 to 1).
   - Check container CPU utilization:
     ```bash
     gcloud monitoring dashboards list --project=project-c3f386b1-6c37-468d-8ee
     ```
3. **Check PostgreSQL Slow Queries**:
   If Cloud SQL is active, inspect slow queries in the Cloud SQL console or check index utilization on large tables (`products`, `orders`).

---

## 3. Investigating Pub/Sub Backlog

### Symptoms
- Cloud Monitoring alert: `ShopCloud - PubSub Worker Backlog Accumulation (dev)` triggers.
- `pubsub.googleapis.com/subscription/num_undelivered_messages` > 100 for 10 minutes.

### Investigation Steps
1. **Check Worker Service Health**:
   ```bash
   curl -i https://shopcloud-api-24903284190.asia-south1.run.app/health
   ```
2. **Inspect Worker Push Logs**:
   Query worker execution logs to see if push messages are returning non-2xx:
   ```bash
   gcloud logging read \
     'resource.type="cloud_run_revision" AND jsonPayload.service="shopcloud-workers"' \
     --project=project-c3f386b1-6c37-468d-8ee \
     --limit=25
   ```
3. **Common Root Causes**:
   - Database unreachable: Workers fail transactional idempotency checks and return HTTP 500, causing Pub/Sub backoff redelivery.
   - OIDC token expiration: In push mode, verify the Pub/Sub push subscription service account has `roles/run.invoker` on the worker service.

---

## 4. Handling Dead-Letter Messages Safely

### Symptoms
- Cloud Monitoring alert: `ShopCloud - Dead Letter Queue Activity (dev)` triggers.
- Messages appear on `shopcloud-inventory-dlq-sub` or `shopcloud-notification-dlq-sub`.

### Investigation Steps
1. **Pull and Inspect Dead-Letter Messages**:
   Pull up to 5 DLQ messages without acknowledging them:
   ```bash
   gcloud pubsub subscriptions pull shopcloud-inventory-dlq-sub \
     --project=project-c3f386b1-6c37-468d-8ee \
     --limit=5 \
     --auto-ack=false
   ```
2. **Analyze Failure Attributes**:
   Inspect the CloudEvent envelope payload, `CloudPubSubDeadLetterSourceDeliveryAttempts` attribute, and original `correlationId`.
3. **Locate Error Log in Cloud Logging**:
   Query logs by the message's `correlationId`:
   ```bash
   gcloud logging read 'jsonPayload.correlationId="<CORRELATION_ID>"' --project=project-c3f386b1-6c37-468d-8ee
   ```
4. **Triage & Replay**:
   - If the failure was caused by a temporary outage (e.g. database stopped): Once database is recovered, publish the event payload back to `shopcloud-domain-events` and acknowledge the DLQ message.
   - If the payload is permanently corrupt/malformed: Acknowledge and purge the message from the DLQ, and document the root cause in the post-incident log.

---

## 5. Investigating Failed Payment Webhooks

### Symptoms
- Payment webhook returns HTTP 400 or HTTP 500.
- Order state remains `PAYMENT_PENDING` after payment completion.

### Privacy Rules
> [!CAUTION]
> Never print or log raw payment card numbers, CVV codes, bank credentials, or secret webhook keys during investigation.

### Investigation Steps
1. **Verify Webhook Signature Verification Logs**:
   ```bash
   gcloud logging read \
     'resource.labels.service_name="shopcloud-api" AND jsonPayload.context="PaymentsService"' \
     --project=project-c3f386b1-6c37-468d-8ee \
     --limit=20
   ```
   Check if the failure was signature verification (`Rejected invalid webhook signature from provider: ...`).
2. **Check Idempotency Ledger**:
   Verify whether the webhook event ID was already recorded in `PaymentTransaction` or `ProcessedEvent`:
   ```bash
   # Look for [IDEMPOTENT_SKIP] in logs
   gcloud logging read 'jsonPayload.message:"IDEMPOTENT_SKIP"' --project=project-c3f386b1-6c37-468d-8ee
   ```
3. **Verify Webhook Secret Configuration**:
   Ensure `PAYMENT_TEST_WEBHOOK_SECRET` or provider webhook secret in Secret Manager matches the configured signature in the provider dashboard.

---

## 6. Distinguishing Intentional Shutdown from an Incident

### Context
Under ShopCloud's strict **₹0 / $0 avoidable spend policy**, Cloud SQL instance `shopcloud-postgres` is kept in `STOPPED` state (`activationPolicy: NEVER`) during idle periods.

### Checklist
Before declaring a database outage incident:
1. Run `gcloud sql instances describe shopcloud-postgres --format="value(state,settings.activationPolicy)"`.
2. If output is `STOPPED NEVER`, this is an **intentional cost-control state**, NOT an outage.
3. The API Gateway gracefully handles this via `offlineFallbackEnabled()`, returning demo catalog data and reporting degraded service health.
4. Do NOT escalate an alert if the shutdown is deliberate.
5. If live database validation is required, start the instance temporarily and stop it immediately after testing:
   ```bash
   # Start for live testing
   gcloud sql instances patch shopcloud-postgres --activation-policy=ALWAYS
   
   # Stop immediately upon completion
   gcloud sql instances patch shopcloud-postgres --activation-policy=NEVER
   ```
