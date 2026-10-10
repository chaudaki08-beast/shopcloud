# Webhook Security & Idempotency Specification

## 1. Raw Request Body Preservation

Payment gateways sign the exact, byte-for-byte serialized payload transmitted over HTTP. Default Express/NestJS body parsers parse the body into JSON and reconstruct objects, which reorders keys or strips whitespace, breaking signature verification.

To prevent signature verification failures, NestJS is initialized with `rawBody: true`:

```typescript
// apps/api/src/main.ts
const app = await NestFactory.create(AppModule, { rawBody: true });
```

In the webhook controller, `req.rawBody` provides the byte buffer directly to cryptographic hash functions:

```typescript
// apps/api/src/modules/payments/payments.controller.ts
@Post('webhook/:provider')
async handleWebhook(
  @Param('provider') provider: string,
  @Headers() headers: Record<string, string>,
  @Req() req: RawBodyRequest<Request>,
) {
  const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  return this.paymentsService.handleWebhook(provider, headers, rawBody);
}
```

---

## 2. Constant-Time HMAC Signature Verification

To eliminate timing attack side-channels, HMAC digest comparisons use `crypto.timingSafeEqual` with strict buffer length checks:

```typescript
const expectedSignature = crypto
  .createHmac('sha256', this.webhookSecret)
  .update(bodyStr)
  .digest('hex');

let isValid = false;
try {
  isValid = crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expectedSignature, 'utf8'),
  );
} catch {
  isValid = false;
}
```

---

## 3. Replay Protection with Timestamp Windows

Stripe webhooks transmit timestamp metadata in `stripe-signature` (`t=<timestamp>,v1=<signature>`). The adapter enforces a 300-second freshness window to reject replayed requests:

```typescript
const now = Math.floor(Date.now() / 1000);
if (Math.abs(now - timestamp) > 300) {
  return {
    isValid: false,
    reason: `Webhook timestamp outside tolerance window (${now - timestamp}s > 300s)`,
  };
}
```

---

## 4. Durable Idempotency Ledger (`ProcessedEvent`)

Even with retries and duplicate HTTP deliveries from payment gateways, transactions must never execute twice.

The `ProcessedEvent` table acts as a distributed idempotency ledger:

```sql
CREATE TABLE "ProcessedEvent" (
  "id" TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "consumer" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessedEvent_eventId_consumer_key" UNIQUE ("eventId", "consumer")
);
```

When a duplicate webhook arrives:
1. `prisma.processedEvent.findUnique({ where: { eventId_consumer: { eventId, consumer } } })` returns the existing entry.
2. The service logs `[IDEMPOTENT_SKIP]` and immediately returns:
   ```json
   {
     "success": true,
     "event": "PAYMENT_SUCCESS",
     "providerEventId": "evt_12345",
     "message": "DUPLICATE_IGNORED"
   }
   ```
3. HTTP 200 is returned to the provider to satisfy delivery requirements without altering database state.
