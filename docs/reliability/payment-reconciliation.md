# ShopCloud Payment Reconciliation & Incident Runbook

## 1. Overview & Scope

The payment lifecycle is inherently asynchronous and distributed across external payment providers (Razorpay, Stripe, Sandbox) and the internal ShopCloud order state machine. Network partitions, late webhooks, customer cancellations, and gateway timeouts can introduce discrepancies between provider ledger balances and internal order states.

This runbook documents how ShopCloud detects, isolates, and resolves payment reconciliation anomalies.

---

## 2. Late Payment Webhook on Cancelled Order (Anomaly FS-07)

### 2.1 The Edge Case
1. Customer initiates checkout; Order status is `PAYMENT_PENDING`.
2. Customer payment session stalls, or order expires due to timeout / customer cancellation.
3. Order transitions to `CANCELLED`; reserved stock is returned to inventory.
4. Minutes or hours later, the payment gateway captures funds and delivers a delayed webhook: `PAYMENT_SUCCESS`.

### 2.2 System Defense & Non-Failing Invariant
In naive architectures, the webhook handler attempts to transition the order from `CANCELLED` to `CONFIRMED`. Because `OrderStateMachine` rejects illegal transitions from `CANCELLED`, throwing an HTTP 409 or HTTP 500 would cause the payment gateway to retry the webhook indefinitely.

**ShopCloud Resilient Handling:**
- Detects that `order.status` is `CANCELLED` or `REFUNDED`.
- Preserves terminal order state (`CANCELLED` remains untouched).
- Emits an **Audit Log Entry**: `action: 'PAYMENT_RECEIVED_ON_CANCELLED_ORDER'`.
- Records an outbox event: `payment.reconciliation.required.v1`.
- Records a `ProcessedEvent` marker for the provider's event ID so the webhook is marked as processed.
- Returns **HTTP 200 OK** (`{ success: true, event: 'PAYMENT_SUCCESS' }`) to satisfy the gateway and stop retry traffic.

---

## 3. Operator Reconciliation Procedure

When a `payment.reconciliation.required.v1` event is observed or flagged in alerts, an operations engineer must follow this standard operating procedure:

### Step 1: Query Pending Reconciliation Orders
Execute query against read replica or database admin tool:
```sql
SELECT 
  o.id AS order_id,
  o.order_number,
  o.status AS order_status,
  p.id AS payment_id,
  p.provider,
  p.transaction_ref,
  p.amount / 100.0 AS amount_inr,
  al.created_at AS flagged_at,
  al.metadata
FROM audit_logs al
JOIN orders o ON o.id = al.entity_id
JOIN payments p ON p.order_id = o.id
WHERE al.action = 'PAYMENT_RECEIVED_ON_CANCELLED_ORDER'
ORDER BY al.created_at DESC;
```

### Step 2: Determine Resolution Path
Review order details with customer support:
- **Path A: Automatic Refund (Default Policy)**  
  Since the customer's items may have been sold to other buyers upon inventory release, issue an immediate refund via the ShopCloud Payment API or Provider Dashboard.
  ```http
  POST /api/v1/payments/:paymentId/refund
  Content-Type: application/json
  Authorization: Bearer <ADMIN_JWT>

  {
    "reason": "ORDER_CANCELLED_PRIOR_TO_CAPTURE",
    "amount": 199900
  }
  ```
- **Path B: Reinstate Order (If Stock Available)**  
  If inventory allows and customer desires fulfillment, create a new manual order linking the verified `paymentId`.

---

## 4. Webhook Cryptographic Verification Triage

### 4.1 Signature Rejection (`INVALID_WEBHOOK_SIGNATURE`)
If Cloud Logging displays `WARN [PaymentsService] Rejected invalid webhook signature from provider`:
1. Check header presence:
   - Razorpay: `x-razorpay-signature`
   - Stripe: `stripe-signature`
   - Test Sandbox: `x-test-signature`
2. Validate secret synchronization in Google Secret Manager:
   - Verify `RAZORPAY_WEBHOOK_SECRET` or `STRIPE_WEBHOOK_SECRET` matches the endpoint configuration in the provider portal.
3. Inspect for timestamp clock drift on Stripe payloads:
   - Stripe signatures use Unix timestamps with a strict 300-second replay tolerance window. Ensure NTP is synced on host containers.

---

## 5. Automated Health & Reconciliation Schedule

In production, a recurring CronJob / Cloud Scheduler job triggers payment polling every 60 minutes to detect orphaned `PENDING` payments older than 30 minutes and query provider status endpoints (`getPaymentStatus`).
