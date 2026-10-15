# ShopCloud Safe Fault Injection Harness & Chaos Engineering Policy

## 1. Overview & Policy

To validate distributed resilience without endangering real systems or customer data, ShopCloud incorporates a controlled **Fault Injection Harness** (`FaultInjector` in `@shopcloud/contracts/src/resilience.ts`).

### Strict Safety Rules
1. **Disabled by Default**: Fault injection is inactive out of the box (`enabled: false`).
2. **Production Immunity**: The harness evaluates the runtime environment. If `NODE_ENV === 'production'`, any configuration attempting to enable fault injection is overridden and permanently disabled.
3. **No External Network Dependencies**: Fault injection runs locally in memory and never requires external chaos SaaS agents.
4. **Targeted Scoping**: Faults are scoped strictly to individual target operations (e.g., `pubsub.publish`, `database.transaction`, `payment.webhook`).

---

## 2. Supported Fault Types

The `FaultInjector` supports the following injection mechanisms:

| Fault Type | Description | Simulation Purpose |
|---|---|---|
| `latency` | Adds an artificial, bounded delay before executing the underlying function | Simulates degraded network conditions, slow database queries, or throttled third-party APIs |
| `transient-error` | Throws a synthetic transient error (e.g., `ECONNRESET`, `ETIMEDOUT`, HTTP 503) | Validates that retry and jitter policies recover successfully |
| `permanent-error` | Throws a non-retryable error (e.g., `BadRequestException`, HTTP 400) | Validates that non-recoverable errors abort fast without infinite retry loops |
| `rate-limiting` | Throws an HTTP 429 Too Many Requests | Tests rate-limiting backoff mechanisms |

---

## 3. Configuration & Usage

### 3.1 Initializing the Injector (Test Environments Only)
```typescript
import { FaultInjector } from '@shopcloud/contracts';

const injector = new FaultInjector({
  enabled: process.env.NODE_ENV !== 'production' && process.env.ENABLE_FAULT_INJECTION === 'true',
  failureRate: 0.5, // 50% probability
  delayMs: 150,     // 150ms synthetic latency
  faultType: 'transient-error',
  targetOperations: ['pubsub.publish'],
});
```

### 3.2 Wrapping an Operation in Tests
```typescript
const result = await injector.execute('pubsub.publish', async () => {
  return await pubsubClient.topic('orders').publish(message);
});
```

If fault injection is disabled or the operation is not targeted, `injector.execute` immediately calls and returns the original function with zero overhead.

---

## 4. Verification & Production Audit

Unit tests in `packages/contracts/test/resilience.test.ts` verify the safety barriers:
- `is disabled by default` (PASS)
- `fault injector ignores requests when disabled` (PASS)
- `allows fault injection only when explicitly configured in non-production` (PASS)

During CI security scans (`scripts/ci-security-check.js`), checks confirm that production deployment manifests and Terraform templates never set `ENABLE_FAULT_INJECTION=true`.
