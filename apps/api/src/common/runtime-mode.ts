import { HttpException, Logger, ServiceUnavailableException } from '@nestjs/common';

const logger = new Logger('RuntimeMode');

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * In-memory demo data and offline fallbacks exist for local preview and DB-less unit tests only.
 * In production every request must hit PostgreSQL; serving per-instance memory on Cloud Run would
 * silently lose writes and diverge across instances, and demo identities would bypass authentication.
 */
export function offlineFallbackEnabled(): boolean {
  return !isProduction();
}

/**
 * Call first thing in a catch block that would otherwise fall back to in-memory/demo data.
 * Outside production it returns and the fallback runs as before. In production it re-throws
 * HTTP errors unchanged and turns anything else (database failures) into 503 Service Unavailable.
 */
export function rethrowInProduction(err: unknown): void {
  if (offlineFallbackEnabled()) return;
  if (err instanceof HttpException) throw err;
  logger.error(`Database operation failed: ${(err as Error)?.message ?? String(err)}`);
  throw new ServiceUnavailableException('DATABASE_UNAVAILABLE');
}

/** Reached a fallback path without an error (e.g. a demo shortcut). Blocked in production. */
export function assertOfflineFallbackAllowed(): void {
  if (!offlineFallbackEnabled()) {
    throw new ServiceUnavailableException('DATABASE_UNAVAILABLE');
  }
}

/**
 * Fail fast at startup when a required secret is missing in production instead of silently
 * using a development default. Outside production the development default is returned.
 */
export function requiredSecret(names: string[], developmentDefault: string): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  if (isProduction()) {
    throw new Error(`Missing required secret: ${names[0]} must be set when NODE_ENV=production`);
  }
  return developmentDefault;
}
