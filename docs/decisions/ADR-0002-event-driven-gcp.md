# ADR-0002: Event-Driven Order Processing via Google Cloud Pub/Sub

## Status
Accepted

## Context
When a customer places an order, the system must perform multiple critical follow-up actions:
* Reserving or confirming inventory in the stock database
* Communicating with payment providers / verifying sandbox webhooks
* Emitting email confirmations and digital tax receipts
* Sending telemetry to monitoring and analytics sinks

If all these actions are executed synchronously in the `POST /orders` request thread:
1. API latency increases drastically, degrading customer conversion.
2. Transient payment provider or email server failures cause the entire order placement to fail.
3. The API Gateway cannot autoscale independently of intensive background workloads.

## Options Considered
1. **Synchronous Monolithic Execution**: API performs all operations directly within the request-response cycle.
2. **In-Memory Queue (Redis / BullMQ)**: Decoupled using Redis queues hosted on compute instances.
3. **Managed Cloud Message Broker (Google Cloud Pub/Sub)**: Serverless, highly scalable message bus with push/pull subscriptions, dead-letter topics (DLQ), and CloudEvents standard envelopes.

## Decision
We selected **Google Cloud Pub/Sub** as the central event backbone.
* The API Gateway performs an atomic database stock reservation and responds immediately with `201 Created`.
* An `order-created` CloudEvent is published to Pub/Sub.
* Separate worker services (`InventoryWorker`, `PaymentWorker`, `NotificationWorker`) subscribe asynchronously.
* Dead-letter topics and exponential backoff retry policies are configured via Terraform.

## Consequences
### Positive
* High-throughput, sub-second API response times.
* Fault isolation: email delivery failures or analytics lag do not block orders.
* Demonstrates real-world production GCP cloud engineering architecture.

### Negative
* Eventual consistency considerations.
* Requires handling idempotency (e.g. duplicate payment webhooks) and distributed failure compensation.
