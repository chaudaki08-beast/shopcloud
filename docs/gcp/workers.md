# Background Workers & Consumer Architecture

## 1. Overview

The `@shopcloud/workers` service handles asynchronous event processing, long-running business chores, and downstream choreography outside the synchronous REST request path.

---

## 2. Worker Specifications

### A. Inventory Worker (`InventoryWorker`)
Responsible for reliable inventory state management following order placement or cancellation.

* **Consumer Name**: `inventory-worker`
* **Trigger Events**: `order.created.v1`, `inventory.released.v1`
* **Business Operations**:
  - Verifies product existence and active status.
  - Enforces non-negative inventory constraints.
  - Atomically decrements or increments stock in Cloud SQL (`Product.stock`).
  - Appends an audit trail record in `InventoryMovement` (`ORDER_RESERVED`, `ORDER_RELEASED`).
  - Records an idempotency entry in `ProcessedEvent`.
* **Downstream Choreography**:
  - Emits `inventory.reserved.v1` (with correlation & causation IDs).
  - Emits `notification.requested.v1` to trigger customer communication.

### B. Notification Worker (`NotificationWorker`)
Responsible for customer communications and transactional messaging.

* **Consumer Name**: `notification-worker`
* **Trigger Events**: `notification.requested.v1`
* **Business Operations**:
  - Validates recipient and template data (`ORDER_CONFIRMATION`, etc.).
  - Enforces durable idempotency via `ProcessedEvent`.
  - Persists communication record into the `Notification` table with `correlationId`.
  - (Future phases): Dispatches email/SMS via SendGrid/Twilio.

---

## 3. Delivery Modes: Pull vs. Push

ShopCloud workers support two deployment architectures:

### 1. Streaming Pull Mode (Background Daemon)
* **Configuration**: `DELIVERY_MODE=pull`
* **Mechanisms**: Worker opens persistent gRPC bi-directional streaming pull channels to GCP Pub/Sub.
* **Best Suited For**: Dedicated worker containers, Compute Engine VMs, GKE pods, or local development.

### 2. Cloud Run Push Mode (Serverless HTTPS)
* **Configuration**: `DELIVERY_MODE=push`
* **Mechanisms**: Google Cloud Pub/Sub delivers HTTP POST requests to `/pubsub/push` on Cloud Run.
* **Security & Authentication**:
  - In production, push subscriptions must configure a dedicated Service Account (`shopcloud-worker-runtime`).
  - Cloud Pub/Sub generates an OpenID Connect (OIDC) JWT token in the `Authorization: Bearer <token>` header.
  - The worker strictly verifies the OIDC token against Google's public OAuth2 certificates and checks `audience` and `email` before processing.

---

## 4. Lifecycle & Graceful Shutdown

Workers implement robust lifecycle handling:
* **Health Probes**: Responds to `GET /health` and `GET /liveness` with HTTP 200 `{"status": "UP", "service": "shopcloud-workers"}`.
* **Graceful Termination**: On `SIGTERM` (Cloud Run scale-down or deployment), the worker:
  1. Stops accepting new push requests or pauses pull subscriptions.
  2. Allows in-flight transactions up to 8 seconds to commit.
  3. Closes Pub/Sub and Prisma database connection pools cleanly.
  4. Exits with code 0 before Cloud Run's 10-second SIGKILL timeout.
