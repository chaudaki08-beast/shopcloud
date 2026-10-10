# Payment Processing Testing & Verification Guide

## 1. Automated Test Suites

### Unit Tests
Execute provider adapter verification, signature verification, and RBAC checks:

```bash
npm run test -w @shopcloud/api -- src/modules/payments/payments.service.spec.ts
```

Tests include:
- `TestPaymentAdapter generates and verifies valid HMAC-SHA256 signature`
- `TestPaymentAdapter rejects tampered raw body or invalid signature`
- `RazorpayPaymentAdapter verifies valid x-razorpay-signature`
- `StripePaymentAdapter verifies stripe-signature timestamped scheme`
- `StripePaymentAdapter rejects replayed webhooks with old timestamp (> 300s)`
- `throws UnauthorizedException when webhook signature is invalid`
- `rejects unsupported payment provider with BadRequestException`
- `returns DUPLICATE_IGNORED when duplicate webhook is delivered`
- `rejects refund when requesting user does not have admin permissions`

### End-to-End Database Lifecycle Tests
Executed against PostgreSQL with transactional rollbacks:
- `initiates payment with server-authoritative amount and records outbox event`
- `enforces idempotency on initiatePayment when called with same idempotency key`
- `processes signed webhook for successful payment, updates order to CONFIRMED, and records ProcessedEvent`
- `issues refund for successful payment by admin, updates order, and records outbox event`
- `handles payment failure webhook with ACID inventory compensation`

---

## 2. Live Cloud SQL Validation Suite

To run the validation script against live Cloud SQL:

1. Temporarily patch Cloud SQL instance activation policy to `ALWAYS`:
   ```bash
   gcloud sql instances patch shopcloud-postgres --activation-policy=ALWAYS
   ```
2. Launch Cloud SQL Proxy on port `5434`:
   ```powershell
   & "path\to\cloud-sql-proxy.exe" --gcloud-auth --port 5434 project-c3f386b1-6c37-468d-8ee:asia-south1:shopcloud-postgres
   ```
3. Run the validation suite:
   ```powershell
   $env:DATABASE_URL="postgresql://shopcloud_app:<password>@127.0.0.1:5434/shopcloud?schema=public"; npx ts-node scripts/validate-phase11.ts
   ```
4. Stop Cloud SQL Proxy and restore activation policy to `NEVER` to maintain $0 spend:
   ```bash
   gcloud sql instances patch shopcloud-postgres --activation-policy=NEVER
   ```
