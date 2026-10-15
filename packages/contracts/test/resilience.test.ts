import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTransientError,
  calculateBackoff,
  withRetry,
  isFaultInjectionEnabled,
  FaultInjector,
} from '../src/resilience';

describe('Contracts — Resilience & Retry Utilities', () => {
  describe('isTransientError classification', () => {
    test('classifies network error codes as transient', () => {
      assert.equal(isTransientError({ code: 'ECONNRESET' }), true);
      assert.equal(isTransientError({ code: 'ETIMEDOUT' }), true);
      assert.equal(isTransientError({ code: 'ECONNREFUSED' }), true);
      assert.equal(isTransientError({ code: 'ENOTFOUND' }), true);
      assert.equal(isTransientError({ code: 'EAI_AGAIN' }), true);
    });

    test('classifies transient HTTP status codes as transient', () => {
      assert.equal(isTransientError({ status: 408 }), true);
      assert.equal(isTransientError({ status: 429 }), true);
      assert.equal(isTransientError({ status: 502 }), true);
      assert.equal(isTransientError({ status: 503 }), true);
      assert.equal(isTransientError({ status: 504 }), true);
      assert.equal(isTransientError({ statusCode: 503 }), true);
      assert.equal(isTransientError({ response: { status: 429 } }), true);
    });

    test('classifies permanent client errors as non-transient', () => {
      assert.equal(isTransientError({ status: 400 }), false);
      assert.equal(isTransientError({ status: 401 }), false);
      assert.equal(isTransientError({ status: 403 }), false);
      assert.equal(isTransientError({ status: 404 }), false);
      assert.equal(isTransientError({ status: 409 }), false);
      assert.equal(isTransientError({ status: 422 }), false);
    });

    test('detects transient messages in error objects', () => {
      assert.equal(isTransientError(new Error('Connection reset by peer')), true);
      assert.equal(isTransientError(new Error('Socket hang up')), true);
      assert.equal(isTransientError(new Error('Request timed out')), true);
      assert.equal(isTransientError(new Error('Validation failed for field email')), false);
    });
  });

  describe('calculateBackoff', () => {
    test('computes deterministic delay with jitter disabled', () => {
      const opts = { baseDelayMs: 100, maxDelayMs: 1000, backoffFactor: 2, jitter: 'none' as const };
      assert.equal(calculateBackoff(1, opts), 100);
      assert.equal(calculateBackoff(2, opts), 200);
      assert.equal(calculateBackoff(3, opts), 400);
      assert.equal(calculateBackoff(4, opts), 800);
      assert.equal(calculateBackoff(5, opts), 1000); // capped at maxDelayMs
    });

    test('full jitter produces bounded delay <= capped raw delay', () => {
      const opts = { baseDelayMs: 100, maxDelayMs: 500, backoffFactor: 2, jitter: 'full' as const };
      for (let i = 0; i < 20; i++) {
        const delay = calculateBackoff(3, opts); // raw = 400
        assert.ok(delay >= 0 && delay <= 400, `Delay ${delay} should be between 0 and 400`);
      }
    });

    test('equal jitter produces delay between raw/2 and raw', () => {
      const opts = { baseDelayMs: 100, maxDelayMs: 500, backoffFactor: 2, jitter: 'equal' as const };
      for (let i = 0; i < 20; i++) {
        const delay = calculateBackoff(3, opts); // raw = 400
        assert.ok(delay >= 200 && delay <= 400, `Delay ${delay} should be between 200 and 400`);
      }
    });
  });

  describe('withRetry execution', () => {
    test('resolves immediately on first attempt when successful', async () => {
      let attempts = 0;
      const result = await withRetry(async () => {
        attempts++;
        return 'success';
      });
      assert.equal(result, 'success');
      assert.equal(attempts, 1);
    });

    test('retries on transient error and succeeds', async () => {
      let attempts = 0;
      const retryDelays: number[] = [];

      const result = await withRetry(
        async (attempt) => {
          attempts++;
          if (attempt === 1) {
            const err = new Error('Socket hang up');
            (err as any).code = 'ECONNRESET';
            throw err;
          }
          return 'recovered';
        },
        {
          baseDelayMs: 10,
          maxDelayMs: 50,
          onRetry: (_att, delay) => {
            retryDelays.push(delay);
          },
        },
      );

      assert.equal(result, 'recovered');
      assert.equal(attempts, 2);
      assert.equal(retryDelays.length, 1);
    });

    test('aborts immediately without retry on permanent error', async () => {
      let attempts = 0;
      await assert.rejects(
        async () => {
          await withRetry(
            async () => {
              attempts++;
              const err = new Error('Invalid coupon code');
              (err as any).status = 400;
              throw err;
            },
            { baseDelayMs: 10, maxAttempts: 3 },
          );
        },
        (err: any) => {
          assert.equal(err.status, 400);
          return true;
        },
      );
      assert.equal(attempts, 1, 'Should NOT retry permanent 400 error');
    });

    test('exhausts retries after maxAttempts and rethrows last error', async () => {
      let attempts = 0;
      await assert.rejects(
        async () => {
          await withRetry(
            async () => {
              attempts++;
              const err = new Error('Database connection timed out');
              (err as any).code = 'ETIMEDOUT';
              throw err;
            },
            { baseDelayMs: 5, maxDelayMs: 20, maxAttempts: 3 },
          );
        },
        /Database connection timed out/,
      );
      assert.equal(attempts, 3);
    });

    test('aborts non-idempotent operations on transient error', async () => {
      let attempts = 0;
      await assert.rejects(
        async () => {
          await withRetry(
            async () => {
              attempts++;
              const err = new Error('Network timeout during payment charge');
              (err as any).code = 'ETIMEDOUT';
              throw err;
            },
            { idempotent: false, baseDelayMs: 10, maxAttempts: 3 },
          );
        },
        /Non-idempotent operation failed with transient error; aborting retry to avoid duplicate effects/,
      );
      assert.equal(attempts, 1, 'Non-idempotent operation must not retry blind transient failure');
    });

    test('enforces per-attempt timeout', async () => {
      await assert.rejects(
        async () => {
          await withRetry(
            async () => {
              await new Promise((resolve) => setTimeout(resolve, 100));
              return 'late';
            },
            { timeoutMs: 20, maxAttempts: 1 },
          );
        },
        /timed out after 20ms/,
      );
    });
  });

  describe('FaultInjection safety guard', () => {
    test('is disabled by default', () => {
      assert.equal(isFaultInjectionEnabled(), false);
    });

    test('fault injector ignores requests when disabled', () => {
      FaultInjector.reset();
      assert.equal(FaultInjector.shouldInject('simulateDbTimeout'), false);
      assert.equal(FaultInjector.shouldInject('simulatePubSubFailure'), false);
    });

    test('allows fault injection only when explicitly configured in non-production', () => {
      FaultInjector.configure({ enabled: true, simulateDbTimeout: true, failureRate: 1.0 });
      assert.equal(FaultInjector.shouldInject('simulateDbTimeout'), true);
      assert.equal(FaultInjector.shouldInject('simulatePubSubFailure'), false);
      FaultInjector.reset();
      assert.equal(FaultInjector.shouldInject('simulateDbTimeout'), false);
    });
  });
});
