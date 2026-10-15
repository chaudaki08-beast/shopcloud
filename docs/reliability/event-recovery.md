# ShopCloud Event Recovery & Transactional Outbox Runbook

## 1. Overview

In ShopCloud's event-driven microservices architecture, cross-service consistency is achieved using domain events published over Google Cloud Pub/Sub. To avoid dual-write hazards (where database updates succeed but Pub/Sub publication fails, or vice-versa), ShopCloud strictly implements the **Transactional Outbox Pattern** alongside durable consumer idempotency ledgers.

This runbook documents the outbox lifecycle, crash recovery mechanics, and procedures for investigating and replaying events.

---

## 2. Transactional Outbox Architecture

```
  ┌────────────────────────────────────────────────────────┐
  │                 API Mutation Request                   │
  └───────────────────────────┬────────────────────────────┘
                              │
                    PostgreSQL Transaction
       ┌──────────────────────┴──────────────────────┐
       ▼                                             ▼
┌──────────────┐                             ┌──────────────┐
│ Entity Table │                             │ Outbox Table │
│(Order/Stock) │                             │(Status=PEND) │
└──────────────┘                             └──────────────┘
       ▲                                             │
       │ Atomic Commit                               │
       └─────────────────────────────────────────────┤
                                                     ▼
                                      ┌─────────────────────────────┐
                                      │ Async Immediate / Poller    │
                                      │ Status -> PROCESSING        │
                                      └──────────────┬──────────────┘
                                                     │
                                           Publish to Pub/Sub
                                                     │
                                      ┌──────────────┴──────────────┐
                                      ▼                             ▼
                                  Success                        Failure
                           Status -> DISPATCHED             Status -> PENDING (Retry)
                                                            or FAILED (if max attempts)
```

### Outbox Record Schema (`OutboxEvent`)
- `id`: Unique identifier of outbox entry.
- `eventId`: UUID of the domain event.
- `eventType`: Qualified event type string (e.g., `order.created.v1`).
- `status`: Lifecycle enum: `PENDING`, `PROCESSING`, `DISPATCHED`, `FAILED`.
- `payload`: Structured JSON domain event payload.
- `attemptCount`: Integer counter tracking publication tries (capped at 5).
- `lastAttemptAt`: Timestamp of the most recent dispatch attempt.
- `nextAttemptAt`: Backoff timestamp determining eligibility for retry.
- `claimedAt`: Timestamp when dispatcher marked status to `PROCESSING`.
- `errorMessage`: Captured exception message for debugging failed publications.

---

## 3. Crash Recovery & Stale `PROCESSING` Sweeper

### 3.1 Problem: Container Crashes During Dispatch
If the Cloud Run API container suffers a hardware crash, SIGKILL, or unexpected termination after claiming an event (`status: PROCESSING`) but before completing publication, the record would remain permanently stuck in `PROCESSING` status if not actively monitored.

### 3.2 Solution: Automated Stale Recovery (`recoverStaleProcessing`)
The `OutboxService` executes a background sweep mechanism with the following behavior:
- **Stale Horizon**: 5 minutes (`staleHorizonMinutes: 5`).
- Any record where `status = 'PROCESSING'` and `claimedAt < (Now - 5 minutes)` is identified as orphaned.
- The sweeper resets `status` to `PENDING` and increments a randomized backoff with full jitter to avoid immediate retry stampedes.
- Metric emitted: `outbox.stale_recovered_count`.

---

## 4. Consumer Idempotency Ledger (`ProcessedEvent`)

Pub/Sub guarantees **at-least-once delivery**. Therefore, workers and downstream consumers must expect duplicate deliveries of identical events.

### 4.1 Deduplication Schema
Consumers maintain a `ProcessedEvent` table keyed by:
```sql
UNIQUE CONSTRAINT uk_processed_event (event_id, consumer);
```
- `eventId`: The UUID of the domain event envelope.
- `consumer`: Unique name of the subscribing consumer (e.g., `inventory-worker`, `notification-worker`, `payment-webhook-test_sandbox`).
- `processedAt`: Timestamp of the first successful processing.

### 4.2 Idempotent Execution Flow
1. Check `processedEvent.findUnique({ where: { eventId_consumer } })`.
2. If record exists:
   - Immediately log `[IDEMPOTENT_SKIP] Duplicate event [eventId] already processed by [consumer].`
   - Acknowledge Pub/Sub message immediately with HTTP 200 / ACK.
   - Return early without executing duplicate mutations.
3. If record does not exist:
   - Execute domain business logic and insert `ProcessedEvent` marker within the same database transaction.
   - Acknowledge message upon transaction commit.

---

## 5. Poison Message Handling & Dead-Letter Queues (DLQ)

### 5.1 Outbox Failure Escalation
- Maximum publication attempts: `5`.
- Backoff progression: Exponential backoff with full jitter up to 30 seconds.
- Upon 5 consecutive failures, the event status transitions to `FAILED`, and an alert is dispatched to Cloud Monitoring / Sentry.

### 5.2 SRE Recovery Procedures for `FAILED` Outbox Events

#### Step 1: Inspect Failed Outbox Records
```sql
SELECT id, event_id, event_type, attempt_count, error_message, created_at, last_attempt_at
FROM outbox_events
WHERE status = 'FAILED'
ORDER BY created_at DESC
LIMIT 50;
```

#### Step 2: Validate Downstream Broker Availability
Ensure Google Cloud Pub/Sub service is healthy:
```bash
gcloud pubsub topics list --project=project-c3f386b1-6c37-468d-8ee
```

#### Step 3: Replay Stalled Events
Once downstream health is verified, an operator can reset failed events back to `PENDING` to trigger immediate background redelivery:
```sql
UPDATE outbox_events
SET status = 'PENDING',
    attempt_count = 0,
    next_attempt_at = NOW(),
    error_message = NULL
WHERE status = 'FAILED'
  AND created_at > NOW() - INTERVAL '24 hours';
```
The background dispatcher will automatically claim and publish the re-queued events without service downtime.
