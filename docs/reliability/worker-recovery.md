# ShopCloud Worker Lifecycle, Graceful Shutdown & Recovery Runbook

## 1. Overview & Architecture

The `@shopcloud/workers` service runs as a background consumer daemon on Google Cloud Run, processing asynchronous events from Pub/Sub push and pull subscriptions (inventory reservations, notification emails, and audit projections).

Because Cloud Run can scale down instances or terminate containers during deploys and auto-scaling events, workers must implement a robust lifecycle manager to drain in-flight tasks cleanly before process exit.

---

## 2. Worker Lifecycle & Graceful Shutdown (`WorkerLifecycle`)

### 2.1 State Tracking Architecture
The worker tracks lifecycle state in `apps/workers/src/worker-lifecycle.ts`:
- **`isShuttingDown` Flag**: Set to `true` immediately when `SIGTERM` or `SIGINT` is received.
- **`inFlightTasks` Counter**: Incremented when a message begins processing and decremented upon completion or failure.
- **Health Endpoint Gating**: When `isShuttingDown` is true, the `/healthz` HTTP probe immediately returns **HTTP 503 Service Unavailable** (`{ status: 'shutting_down' }`). This signals the Cloud Run load balancer to stop directing new push requests to this instance.

### 2.2 Graceful Drain Sequence

```
 ┌────────────────────────────────────────┐
 │   Cloud Run Signals SIGTERM / SIGINT   │
 └───────────────────┬────────────────────┘
                     │
                     ▼
    Set WorkerLifecycle.isShuttingDown = true
    HTTP /healthz immediately returns 503
                     │
                     ▼
    Awaiting in-flight tasks (inFlightTasks == 0)
    [Bounded Wait: up to 10,000ms deadline]
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
 All tasks drained         Deadline exceeded
 (inFlight == 0)           (Forced ungraceful abort)
        │                         │
        └────────────┬────────────┘
                     │
                     ▼
    Close Prisma Database Connection Pool
                     │
                     ▼
             Process exits with code 0
```

---

## 3. Poison Message Isolation & DLQ Routing

### 3.1 The Poison Message Hazard
A poison message is a structurally malformed, unparseable, or logic-breaking message that causes consumer code to throw an unhandled exception every time it is read. Without protective dead-letter handling, Pub/Sub will continuously redeliver the message, wasting compute resources and spamming logs.

### 3.2 Schema Normalization & Non-2xx Strategy
1. The worker passes incoming raw payloads through `normalizeEnvelope(rawPayload)`.
2. If the message lacks mandatory CloudEvent or EventEnvelope fields (`eventId`, `eventType`, `data`), it is categorized as a schema violation.
3. In Pub/Sub push mode:
   - Returning HTTP 400 or HTTP 422 triggers Pub/Sub's dead-letter policy after max delivery attempts (configured to 5 attempts).
   - Once 5 attempts fail, Pub/Sub routes the payload to the Dead Letter Topic: `shopcloud-order-events-dlq`.

---

## 4. DLQ Inspection & Redrive Operations

When messages accumulate in the DLQ, operations engineers should follow this runbook:

### Step 1: Pull and Inspect Dead-Lettered Messages
Using Google Cloud SDK:
```bash
gcloud pubsub subscriptions pull shopcloud-order-events-dlq-sub \
  --project=project-c3f386b1-6c37-468d-8ee \
  --auto-ack=false \
  --limit=10 \
  --format=json
```

### Step 2: Analyze Failure Cause
Examine attributes:
- `CloudPubSubDeadLetterSourceSubscription`: Identifies originating subscription.
- `CloudPubSubDeadLetterDeliveryAttempts`: Verifies attempt count.
- Match payload `eventId` against Cloud Logging:
```
resource.type="cloud_run_revision"
textPayload=~"Malformed Pub/Sub envelope"
```

### Step 3: Redrive Validated Messages
If a code bug caused the failure and a patched worker revision is deployed, re-publish the DLQ payloads to the primary topic (`shopcloud-order-events`):
```bash
gcloud pubsub topics publish shopcloud-order-events \
  --project=project-c3f386b1-6c37-468d-8ee \
  --message='{"specversion":"1.0","id":"...","type":"order.created.v1","data":{...}}'
```
Acknowledge the original message in the DLQ subscription once re-published.
