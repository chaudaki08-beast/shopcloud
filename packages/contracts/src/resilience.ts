/**
 * ShopCloud Reliability & Resilience Primitives (Phase 16)
 *
 * Provides bounded retries with exponential backoff and jitter, error classification,
 * idempotent operation guards, and a safe, disabled-by-default fault injection interface.
 */

export type JitterMode = 'full' | 'equal' | 'none';

export interface RetryOptions {
  /** Maximum number of execution attempts before throwing. Default: 3 */
  maxAttempts: number;
  /** Initial backoff delay in milliseconds. Default: 200 ms */
  baseDelayMs: number;
  /** Ceiling for exponential backoff delay in milliseconds. Default: 5000 ms */
  maxDelayMs: number;
  /** Backoff multiplier per attempt. Default: 2 */
  backoffFactor: number;
  /** Jitter strategy to prevent thundering herds / retry storms. Default: 'full' */
  jitter: JitterMode | boolean;
  /** Optional per-attempt timeout in milliseconds. Default: 0 (disabled) */
  timeoutMs?: number;
  /** Optional total elapsed timeout across all attempts in milliseconds. Default: 0 (disabled) */
  totalTimeoutMs?: number;
  /** Predicate determining whether an error is transient and safe to retry. */
  isTransient?: (error: unknown) => boolean;
  /** Callback invoked prior to each retry sleep. */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  /** Whether the operation is safe to repeat. Default: true. If false, transient errors with unknown outcomes abort immediately. */
  idempotent?: boolean;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
  backoffFactor: 2,
  jitter: 'full',
  timeoutMs: 0,
  totalTimeoutMs: 0,
  idempotent: true,
};

/**
 * Classifies whether an error is transient (network disconnect, rate limit, upstream 503)
 * or permanent (validation error, 401 unauthorized, 409 state conflict).
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  const err = error as Record<string, any>;
  const message = String(err.message || '').toLowerCase();
  const code = String(err.code || '').toUpperCase();
  const status = Number(err.status || err.statusCode || (err.response && err.response.status) || 0);

  // Permanent client errors — NEVER retry
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return false;
  }

  // Known transient HTTP statuses
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  // Network / OS level transient codes
  const transientCodes = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EPIPE',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
  ];
  if (transientCodes.includes(code)) {
    return true;
  }

  // Common transient message patterns
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('connection reset') ||
    message.includes('socket hang up') ||
    message.includes('network error') ||
    message.includes('econnreset') ||
    message.includes('rate limit')
  ) {
    return true;
  }

  return false;
}

/**
 * Computes backoff duration in milliseconds with selected jitter strategy.
 */
export function calculateBackoff(
  attempt: number,
  options: Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs' | 'backoffFactor' | 'jitter'>,
): number {
  const { baseDelayMs, maxDelayMs, backoffFactor, jitter } = options;
  const rawDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(backoffFactor, Math.max(0, attempt - 1)));

  if (jitter === false || jitter === 'none') {
    return Math.floor(rawDelay);
  }

  if (jitter === 'equal') {
    const half = rawDelay / 2;
    return Math.floor(half + Math.random() * half);
  }

  // Full jitter: uniformly random between 0 and rawDelay
  return Math.floor(Math.random() * rawDelay);
}

/**
 * Wraps an async operation with bounded retries, exponential backoff, jitter, and error classification.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  customOptions?: Partial<RetryOptions>,
): Promise<T> {
  const options: RetryOptions = {
    ...DEFAULT_RETRY_OPTIONS,
    ...customOptions,
  };

  const startTime = Date.now();
  let attempt = 0;

  while (attempt < options.maxAttempts) {
    attempt++;

    // Check total elapsed time ceiling
    if (options.totalTimeoutMs && options.totalTimeoutMs > 0) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= options.totalTimeoutMs) {
        throw new Error(
          `Operation exceeded total timeout of ${options.totalTimeoutMs}ms after ${attempt - 1} attempts`,
        );
      }
    }

    try {
      if (options.timeoutMs && options.timeoutMs > 0) {
        let timer: NodeJS.Timeout | undefined;
        try {
          return await Promise.race([
            fn(attempt),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                const timeoutErr = new Error(`Attempt ${attempt} timed out after ${options.timeoutMs}ms`);
                (timeoutErr as any).code = 'ETIMEDOUT';
                reject(timeoutErr);
              }, options.timeoutMs);
              if (timer.unref) timer.unref();
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

      return await fn(attempt);
    } catch (err: unknown) {
      const isLastAttempt = attempt >= options.maxAttempts;

      if (isLastAttempt) {
        throw err;
      }

      const checkTransient = options.isTransient || isTransientError;
      const transient = checkTransient(err);

      // Do not retry permanent errors
      if (!transient) {
        throw err;
      }

      // Non-idempotent operations must not be retried blindly
      if (options.idempotent === false) {
        throw new Error(
          `Non-idempotent operation failed with transient error; aborting retry to avoid duplicate effects: ${(err as Error).message}`,
        );
      }

      const delayMs = calculateBackoff(attempt, options);

      if (options.onRetry) {
        try {
          options.onRetry(attempt, delayMs, err);
        } catch {
          // Ignore listener errors
        }
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`Exhausted all ${options.maxAttempts} retry attempts`);
}

// ==========================================
// Safe Fault-Injection Interface (Disabled by default)
// ==========================================

export interface FaultInjectionConfig {
  enabled: boolean;
  simulateDbTimeout?: boolean;
  simulatePubSubFailure?: boolean;
  simulateProviderTimeout?: boolean;
  simulatePoisonMessage?: boolean;
  simulateWorkerCrash?: boolean;
  failureRate?: number; // 0.0 to 1.0
}

/**
 * Returns whether fault injection is active.
 * STRICT SAFETY RULE: Always false unless FAULT_INJECTION_ENABLED === 'true' and NOT in production.
 */
export function isFaultInjectionEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.FAULT_INJECTION_ENABLED === 'true';
}

/**
 * Process-local fault injection controller for deterministic testing.
 */
class FaultInjectionManager {
  private config: FaultInjectionConfig = {
    enabled: false,
    failureRate: 1.0,
  };

  configure(config: Partial<FaultInjectionConfig>): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SECURITY VIOLATION: Fault injection is prohibited in production');
    }
    this.config = {
      ...this.config,
      ...config,
    };
  }

  reset(): void {
    this.config = {
      enabled: false,
      failureRate: 1.0,
    };
  }

  shouldInject(fault: keyof Omit<FaultInjectionConfig, 'enabled' | 'failureRate'>): boolean {
    if (!isFaultInjectionEnabled() && !this.config.enabled) return false;
    if (!this.config[fault]) return false;

    const rate = this.config.failureRate ?? 1.0;
    return Math.random() < rate;
  }
}

export const FaultInjector = new FaultInjectionManager();
