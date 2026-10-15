# ShopCloud Retry, Timeout & Jitter Policy

## 1. Overview & Objective

This document defines the standardized retry, timeout, backoff, and error taxonomy policy implemented across ShopCloud services (`@shopcloud/contracts`, `@shopcloud/api`, and `@shopcloud/workers`). 

Improper retry behavior is one of the leading causes of cascading failures in distributed systems. When an upstream service stumbles, uncoordinated retries with deterministic backoff create synchronized thundering herds that prolong downtime. This policy ensures all retries are bounded, transient-error-aware, and decorrelated using cryptographic or uniform jitter.

---

## 2. Error Taxonomy & Transient Classification

Errors encountered during remote or external service calls are classified into two strict categories:

```
                      ┌──────────────────────────────────────┐
                      │          Intercepted Error           │
                      └──────────────────┬───────────────────┘
                                         │
                    ┌────────────────────┴───────────────────┐
                    ▼                                        ▼
      ┌───────────────────────────┐            ┌───────────────────────────┐
      │     Transient Errors      │            │     Permanent Errors      │
      │  (Safe & Eligible to Retry)│           │ (Fail Fast / Never Retry) │
      └───────────────────────────┘            └───────────────────────────┘
      - HTTP 429 (Rate Limited)                - HTTP 400 (Bad Request)
      - HTTP 500 / 502 / 503 / 504             - HTTP 401 (Unauthorized)
      - ECONNRESET, ECONNREFUSED               - HTTP 403 (Forbidden)
      - ETIMEDOUT, ENOTFOUND                   - HTTP 404 (Not Found)
      - Database Deadlocks / 40P01             - HTTP 409 (Conflict / State Error)
      - Pub/Sub Server Unavailable             - HTTP 422 (Unprocessable Entity)
      - Lock timeout errors                    - Cryptographic Signature Mismatch
                                               - Schema / JSON Parse Error
```

### Classification Implementation (`isTransientError`)
Defined in `@shopcloud/contracts/src/resilience.ts`:
- Checks Node.js system error codes: `ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`, `EHOSTUNREACH`, `EPIPE`, `ENOTFOUND`, `EAI_AGAIN`.
- Checks HTTP status codes: `429`, `500`, `502`, `503`, `504`.
- Checks PostgreSQL / Prisma SQLSTATE error codes: `40P01` (Deadlock detected), `40001` (Serialization failure), `57P01` (Admin shutdown).
- Checks error message substrings: `network`, `timeout`, `reset`, `temporarily unavailable`, `deadlock`, `throttled`.
- Any error not matching the transient criteria is treated as **permanent** and aborted immediately without retry.

---

## 3. Backoff Strategy & Jitter Algorithms

### 3.1 Why Jitter is Mandatory
Deterministic exponential backoff ($Delay = Base \times 2^{attempt}$) causes all clients that failed at the same instant to retry at identical future intervals, generating repeated synchronized traffic spikes ("retry storms"). Jitter decorrelates retry attempts uniformly.

### 3.2 Implemented Jitter Models

#### Full Jitter (Default Recommended for Network Calls)
Full jitter randomizes the delay uniformly between 0 and the capped exponential delay:
$$\text{RawDelay} = \min(\text{maxDelayMs}, \text{baseDelayMs} \times 2^{\text{attempt}-1})$$
$$\text{FullJitterDelay} = \text{UniformRandom}(0, \text{RawDelay})$$

#### Equal Jitter (Recommended for Database Lock Contention)
Equal jitter guarantees at least half the backoff period while randomizing the remaining half:
$$\text{EqualJitterDelay} = \frac{\text{RawDelay}}{2} + \text{UniformRandom}\left(0, \frac{\text{RawDelay}}{2}\right)$$

### 3.3 Default Configuration Parameters

| Parameter | Default Value | Description |
|---|---|---|
| `maxAttempts` | `3` (API calls), `5` (Outbox dispatch) | Maximum total execution attempts before giving up |
| `baseDelayMs` | `100 ms` | Initial backoff duration for the first retry |
| `maxDelayMs` | `5,000 ms` (API), `30,000 ms` (Outbox) | Maximum backoff ceiling regardless of attempt count |
| `jitter` | `'full'` | Jitter mode (`'full'`, `'equal'`, or `'none'` for deterministic tests) |
| `attemptTimeoutMs`| `5,000 ms` | Timeout threshold enforced on each individual attempt |
| `isIdempotent` | `true` (enforced check) | Guard preventing automatic retry of mutating non-idempotent operations |

---

## 4. Non-Idempotent Operation Protection

> [!WARNING]
> Retrying a non-idempotent mutation (such as an un-idempotent card charge or non-deduplicated inventory adjustment) during a transient network disconnect can result in double-charging or corrupt inventory balances.

- All mutating API calls requiring retries MUST carry a unique `idempotencyKey` (UUIDv4).
- The `withRetry` executor checks `isIdempotent`. If `isIdempotent: false`, any transient failure will **NOT** be retried automatically; the error is immediately propagated to the caller with context.

---

## 5. Usage Example

```typescript
import { withRetry, DEFAULT_RETRY_OPTIONS } from '@shopcloud/contracts';

const result = await withRetry(
  async (attempt) => {
    return await externalPaymentGateway.call({ ...payload, attempt });
  },
  {
    ...DEFAULT_RETRY_OPTIONS,
    maxAttempts: 3,
    baseDelayMs: 200,
    maxDelayMs: 2000,
    jitter: 'full',
    attemptTimeoutMs: 3000,
    isIdempotent: true,
    onRetry: (attempt, error, delayMs) => {
      logger.warn(`Attempt ${attempt} failed with ${error.message}. Retrying in ${delayMs}ms...`);
    },
  },
);
```
