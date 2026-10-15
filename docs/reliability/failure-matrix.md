# ShopCloud Failure Scenario Matrix & System Invariants

## 1. System Overview

ShopCloud is an asynchronous, event-driven e-commerce platform deployed on Google Cloud Platform. This failure scenario matrix catalogs all critical architectural failure modes across API, Worker, Database, Payment Gateways, and Pub/Sub event streams, defining expected degradation behavior, automatic protections, recovery procedures, and invariants.

---

## 2. Comprehensive Failure Matrix

| ID | Failure Scenario | Detection / Telemetry Signal | Impact / Blast Radius | Automatic Protection & Mitigation | Recovery Action | Verified Invariant |
|---|---|---|---|---|---|---|
| **FS-01** | **Cloud SQL Connection Drop / Transient Outage** | Sentry DB connection errors, HTTP 503 spikes, Cloud Monitoring `cloudsql.googleapis.com/database/network/connections` = 0 | Write operations blocked; API unable to commit transactions or outbox events | Exponential backoff retry with full jitter (`withRetry`); Read-only fallback cached responses where safe | Cloud SQL High Availability automated failover; connection pool reconnection upon DB revival | **Zero Data Corruption / Atomic Rollback**: Uncommitted transactions roll back completely without partial record creation. |
| **FS-02** | **Pub/Sub Broker Unavailable / Outage** | Outbox publication failure logs (`WARN [OutboxService]`), dead-letter counts, Pub/Sub client timeouts | Asynchronous workers receive no new events; order confirmations delayed | Transactional Outbox pattern decouples client requests; events persist in PostgreSQL outbox table; retries with jitter | Outbox background dispatcher sweeps pending events once Pub/Sub connectivity is restored | **At-Least-Once Delivery**: No business event is lost; client HTTP 200 response is decoupled from broker uptime. |
| **FS-03** | **Worker Pod Sudden Termination / SIGKILL** | Disconnected container metric in Cloud Run, incomplete event processing, missing task heartbeats | Currently executing event interrupted mid-processing | Container lifecycle SIGTERM handler initiates 10s graceful drain; stale `PROCESSING` event sweeper resets abandoned outbox records | Automated container restart by Cloud Run; sweeper reclaims events exceeding 5m stale threshold | **No Orphaned In-Flight State**: In-flight tasks drain or get recovered without double-action. |
| **FS-04** | **Poison / Malformed Event Envelope** | Worker error log (`Malformed Pub/Sub envelope`), Pub/Sub redelivery counter incrementing | Worker could get caught in endless deserialization crash loop | Strict envelope schema validator catches bad payloads immediately; non-transient parser errors trigger dead-letter queue routing without infinite loop | SRE team inspects Dead Letter Topic (`shopcloud-order-events-dlq`), patches consumer or purges invalid payload | **DLQ Isolation**: Malformed events do not block subsequent valid queue items. |
| **FS-05** | **Duplicate Event Delivery / Message Replay** | Pub/Sub retry log, duplicate webhook receipts | Potential duplicate charges or redundant inventory decrements | Durable `ProcessedEvent` database ledger checks `(eventId, consumer)` before processing; returns idempotent success | None required; automatic skip logged as `[IDEMPOTENT_SKIP]` | **Durable Idempotency**: Exactly-once business side effects despite at-least-once transport delivery. |
| **FS-06** | **Concurrent Inventory Checkout Race** | Concurrent checkout requests for scarce SKU (stock = 1) | Risk of overselling below zero inventory | Atomically executed database transaction with strict stock check (`stock >= requested`) and decrement constraint | Second concurrent transaction receives HTTP 400 Insufficient Stock and aborts cleanly | **Non-Negative Inventory Invariant**: `stock >= 0` maintained under all concurrency conditions. |
| **FS-07** | **Late Payment Webhook on Cancelled Order** | Webhook received for order already in `CANCELLED` status | Customer card charged by payment gateway after order was timed out or cancelled | Idempotent webhook handler detects cancelled state; transitions order remains `CANCELLED`; writes audit log; emits `payment.reconciliation.required.v1` | Automated or manual refund via payment operator portal; reconciliation runbook | **State Machine Integrity**: Terminal order states (`CANCELLED`, `REFUNDED`) are immutable to payment captures. |
| **FS-08** | **Payment Gateway Outage / Webhook Drop** | Gateway 5xx errors, missing webhook web events, payment remaining in `PENDING` | User cannot complete checkout or order remains pending despite authorization | Client receives transient error advice; fallback deterministic sandbox adapter in local/test environments; bounded retry | Scheduled payment status polling reconciliation job syncs status with gateway APIs | **No Phantom Commitments**: No order is marked confirmed without verified payment capture. |
| **FS-09** | **Forged / Tampered Webhook Payload** | `WARN [PaymentsService] Rejected invalid webhook signature` | Unauthorized order status transition attempt by malicious actor | HMAC-SHA256 constant-time cryptographic signature verification (`timingSafeEqual`) rejects forged requests with HTTP 401 | Security incident logged; source IP rate-limited or blocked via Cloud Armor | **Zero Trust Ingestion**: Unauthenticated or forged webhooks rejected with zero side-effects. |
| **FS-10** | **Outbox Publisher Crash Mid-Dispatch** | Outbox record in `PROCESSING` status older than 5 minutes | Outbox event stuck in processing state, not delivered to subscribers | Stale processing recovery sweeper (`recoverStaleProcessing`) resets records to `PENDING` with randomized jitter | Background sweeper automatically re-queues stale records | **Durable Outbox Forward Progress**: No event remains stuck indefinitely in processing status. |
| **FS-11** | **Database Storage Exhaustion / Read-Only Disk** | PostgreSQL error `could not extend file: No space left on device` | All database write operations fail | Cloud SQL automatic storage increase configured; alerts triggered at 80% and 90% disk utilization | SRE increases disk quota via Terraform / GCP console; purges historical logs | **Fail-Safe Write Rejection**: Rejects new incoming mutations rather than committing corrupted transactions. |
| **FS-12** | **Network Thundering Herd on Downstream Recovery** | Service reconnection spike following outage recovery | High-concurrency stampede overwhelms recovering service, triggering cascading collapse | Full and equal jitter backoff algorithms distribute retry attempts uniformly over time window | Jitter spreads traffic spike over backoff curve until service stabilizes | **Thundering Herd Mitigation**: Retry traffic is uniformly distributed to prevent secondary outages. |

---

## 3. Core Architectural Invariants

### Invariant 1: Inventory Non-Negativity
`∀ product p, stock(p) >= 0`  
Inventory decrement operations are guarded by atomic database transactions that verify available inventory prior to executing decrements. Negative quantities are rejected at both DTO validation and persistence layers.

### Invariant 2: Order State Machine Monotonicity
Orders transition strictly along forward valid edges:
`DRAFT -> PAYMENT_PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED`  
Or to terminal cancellation states:
`PAYMENT_PENDING -> CANCELLED`, `CONFIRMED -> CANCELLED`  
No transition is permitted from terminal states (`CANCELLED`, `DELIVERED`, `REFUNDED`) back to active states.

### Invariant 3: Transactional Outbox Atomic Consistency
Every state change that produces a domain event MUST write the outbox envelope within the exact same database transaction as the entity mutation. No domain event is emitted if the entity mutation fails, and no entity mutation is committed without its corresponding outbox envelope.

### Invariant 4: Webhook Replay & Idempotency Immunity
Every inbound webhook is deduplicated against the `ProcessedEvent` ledger. Reprocessing the same provider event ID produces an identical, safe response with zero side-effects.
