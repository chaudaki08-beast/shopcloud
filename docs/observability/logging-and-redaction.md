# ShopCloud Structured Logging & Privacy Redaction Guide

## 1. Overview

Logging in ShopCloud is engineered to deliver high forensic fidelity for debugging and incident response while strictly preventing sensitive credential or customer personal data leakage.

All log output is emitted as single-line JSON structured entries compatible with Google Cloud Logging when running in production or when `LOG_FORMAT=json`. In local development (`NODE_ENV=development`), logs format as human-readable colorized terminal lines.

---

## 2. Structured Log Entry Schema

Every log emitted by `StructuredLoggerService` (API) or `WorkerLogger` (Workers) adheres to the following specification:

| Field | Type | Google Cloud Logging Role | Description |
| :--- | :--- | :--- | :--- |
| `severity` | `string` | Top-level severity | `DEBUG`, `INFO`, `NOTICE`, `WARNING`, `ERROR`, `CRITICAL`. |
| `message` | `string` | Top-level message | Sanitized text summary of the event or operation. |
| `timestamp` | `string` | Log timestamp | ISO 8601 UTC timestamp. |
| `service` | `string` | Service identifier | `shopcloud-api`, `shopcloud-workers`, or `shopcloud-web`. |
| `environment` | `string` | Environment tag | `production`, `development`, or `test`. |
| `context` | `string` | Module context | Class or component name (e.g. `PaymentsService`, `InventoryWorker`). |
| `correlationId` | `string` | Correlation identifier | Unique tracking ID propagated across API, events, and workers. |
| `logging.googleapis.com/trace` | `string` | Cloud Trace correlation | Fully-qualified trace resource: `projects/${PROJECT_ID}/traces/${TRACE_ID}`. |
| `logging.googleapis.com/spanId` | `string` | Cloud Trace span | 16-hex digit span ID. |
| `httpRequest` | `object` | HTTP access log entry | Contains `requestMethod`, `requestUrl`, `status`, `latency`, `userAgent`, `remoteIp`. |
| `error` | `object` | Error payload | Contains `name`, `message` (redacted), and bounded `stack` (max 5 lines, sanitized). |
| `metadata` | `object` | Bounded payload metadata | Sanitized contextual key-value pairs. |

---

## 3. Data Privacy & Automated Redaction Engine

ShopCloud enforces strict automated redaction before any log is written to `stdout` or `stderr`. The redaction engine resides in `@shopcloud/contracts` and operates across two complementary mechanisms:

### 3.1 Object Property Name Filtering (`isSensitiveKey`)
Any object key matching the following case-insensitive substrings or patterns is immediately replaced with `"[REDACTED]"`:

- **Authentication & Tokens**: `password`, `secret`, `token`, `jwt`, `authorization`, `auth_header`, `bearer`, `cookie`, `set-cookie`, `api_key`, `private_key`
- **Financial & Payment**: `credit_card`, `card_number`, `cvv`, `cvc`, `pan`, `account_number`, `webhook_secret`, `signature`
- **Infrastructure Credentials**: `database_url`, `db_url`

```typescript
// Example: Original object before logging
const orderInput = {
  orderId: "ord-8819",
  userPassword: "PlaintextPassword123!",
  card: { cardNumber: "4111222233334444", cvv: "123" }
};

// Result after redactSensitiveData(orderInput)
{
  orderId: "ord-8819",
  userPassword: "[REDACTED]",
  card: { cardNumber: "[REDACTED]", cvv: "[REDACTED]" }
}
```

### 3.2 String Pattern Masking (`redactString`)
When strings (including error messages, URLs, or exception messages) contain embedded credentials, regex sanitizers mask them in-place:

1. **Database URLs**:
   `postgresql://shopcloud:secret_password@127.0.0.1:5432/shopcloud`  
   &rarr; `postgresql://shopcloud:[REDACTED]@127.0.0.1:5432/shopcloud`
2. **Bearer Tokens**:
   `Bearer eyJhbGciOiJIUzI1NiIsIn...`  
   &rarr; `Bearer [REDACTED_TOKEN]`
3. **Raw JWT Signatures**:
   `eyJhbGciOi...eyJzdWIiOi...abc1234`  
   &rarr; `[REDACTED_JWT]`
4. **Credit Card Number Sequences**:
   `4111 2222 3333 4444`  
   &rarr; `****-****-****-4444`

---

## 4. Error Context & Bounded Stack Traces

To prevent duplicate logs, log bloat, and accidental credential leakage during exceptions:

1. **Top-5 Stack Limit**: Stack traces are bounded to the top 5 stack frames:
   ```typescript
   error.stack.split('\n').slice(0, 5).join('\n')
   ```
2. **Sanitized Error Messages**: Error messages pass through `redactString()` before emission.
3. **Correlation ID Echo**: The active `correlationId` is included in both the server error log and the JSON response returned to the client:
   ```json
   {
     "success": false,
     "error": {
       "code": "INTERNAL_SERVER_ERROR",
       "message": "An unexpected server error occurred",
       "correlationId": "corr-k78d92a-1728927703"
     },
     "timestamp": "2026-10-14T17:41:43.000Z"
   }
   ```

---

## 5. Worker Event Lifecycle Logging

Workers emit structured event lifecycle logs via `WorkerLogger.logEvent()`:

```json
{
  "severity": "INFO",
  "message": "[inventory-worker] Event [order.created.v1] id=evt-8819 corr=corr-k78d92a outcome=SUCCESS duration=42ms",
  "service": "shopcloud-workers",
  "context": "inventory-worker",
  "correlationId": "corr-k78d92a",
  "metadata": {
    "consumerName": "inventory-worker",
    "eventType": "order.created.v1",
    "eventId": "evt-8819",
    "correlationId": "corr-k78d92a",
    "aggregateType": "Order",
    "aggregateId": "ord-8819",
    "outcome": "SUCCESS",
    "durationMs": 42
  }
}
```

### Possible Outcomes:
- **`SUCCESS`** (`severity: INFO`): Event processed and state committed.
- **`DUPLICATE_IGNORED`** (`severity: NOTICE`): Event already recorded in `ProcessedEvent` idempotency ledger; safely skipped without re-executing business logic.
- **`FAILED`** (`severity: ERROR`): Processing error occurred; message NACKed or rejected for Pub/Sub exponential backoff retry.
