# ShopCloud Payment Processing Architecture (Phase 11)

## 1. Architectural Overview

ShopCloud Phase 11 implements a provider-agnostic, event-driven payment lifecycle engineered for cloud-native reliability and strict security standards.

```
+---------------------------------------------------------------------------------------------------------+
|                                        SHOPCLOUD PAYMENT LIFECYCLE                                      |
+---------------------------------------------------------------------------------------------------------+

  Client / Web App                     Cloud Run REST API                     PostgreSQL / Cloud SQL
        |                                       |                                       |
        | 1. POST /payments/initiate            |                                       |
        |-------------------------------------->| 2. Verify Order ownership             |
        |                                       |    & server-authoritative amount      |
        |                                       |-------------------------------------->|
        |                                       | 3. Create Session via Adapter         |
        |                                       |    (Test / Razorpay / Stripe)         |
        |                                       | 4. ACID: Payment (PENDING)            |
        |                                       |    + Outbox: payment.initiated.v1     |
        |                                       |<--------------------------------------|
        | 5. Return Checkout URL / Session      |                                       |
        |<--------------------------------------|                                       |
        |                                       |                                       |
  Payment Provider Webhook                      |                                       |
        |                                       |                                       |
        | 6. POST /payments/webhook/:provider   |                                       |
        |    (Raw body + HMAC-SHA256 signature) |                                       |
        |-------------------------------------->| 7. Validate Raw Body Signature        |
        |                                       | 8. Check ProcessedEvent (Idempotency) |
        |                                       |-------------------------------------->|
        |                                       | 9. If SUCCESS:                        |
        |                                       |    - Payment -> SUCCESS               |
        |                                       |    - Order -> CONFIRMED               |
        |                                       |    - Outbox: payment.succeeded.v1     |
        |                                       | 10. If FAILED:                        |
        |                                       |    - Payment -> FAILED                |
        |                                       |    - Order -> CANCELLED               |
        |                                       |    - Inventory stock compensated      |
        |                                       |    - Outbox: payment.failed.v1        |
        |                                       |<--------------------------------------|
        | 11. 200 OK Webhook Acknowledged       |                                       |
        |<--------------------------------------|                                       |
```

## 2. Core Security & Correctness Principles

1. **Server-Authoritative Integer Currency**:
   Amounts are never trusted from client payloads. The exact integer paise total is derived directly from `order.grandTotal` inside database transactions.
2. **Cryptographic HMAC Webhook Verification**:
   Raw unparsed request bodies are preserved (`rawBody: true` in NestJS) to verify HMAC-SHA256 digital signatures with constant-time equality checks against timing attacks.
3. **Durable Idempotency Ledger**:
   Duplicate webhook events are tracked in the `ProcessedEvent` table using composite keys `[eventId, consumer]`. Duplicate deliveries return `DUPLICATE_IGNORED` without executing secondary mutations.
4. **ACID Inventory Compensation**:
   If a payment fails or times out, the reserved stock is restored within a database transaction, logging an audit record in `InventoryMovement`.
5. **Transactional Outbox Event Publication**:
   State transitions and domain events (`payment.initiated.v1`, `payment.succeeded.v1`, `payment.failed.v1`, `payment.refunded.v1`) are atomically committed in the same database transaction before publication to Google Cloud Pub/Sub.

## 3. Supported Provider Adapters

- **`TEST_SANDBOX`**: Deterministic in-memory and HMAC cryptographic test adapter designed for CI/CD and zero-cost local / staging tests.
- **`RAZORPAY_SANDBOX`**: Production-ready Indian payment adapter supporting UPI, Cards, and NetBanking in INR paise with `x-razorpay-signature` verification.
- **`STRIPE_SANDBOX`**: Stripe payment intent adapter supporting 300-second timestamp replay tolerance and `stripe-signature` v1 HMAC validation.
