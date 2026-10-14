import { AsyncLocalStorage } from 'node:async_hooks';
import { CorrelationContext } from '@shopcloud/contracts';

const asyncLocalStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Accesses the current async request or worker correlation context.
 */
export function getCorrelationContext(): CorrelationContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Convenience accessor for the active correlation ID.
 * Returns 'system' if invoked outside a tracked async scope.
 */
export function getActiveCorrelationId(): string {
  const store = asyncLocalStorage.getStore();
  return store?.correlationId || 'system';
}

/**
 * Runs a function within the specified correlation context scope.
 */
export function runWithCorrelationContext<T>(
  context: CorrelationContext,
  fn: () => T,
): T {
  return asyncLocalStorage.run(context, fn);
}

export { asyncLocalStorage };
