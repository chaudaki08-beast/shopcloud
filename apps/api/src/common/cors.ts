import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { isProduction } from './runtime-mode';

/**
 * CORS from CORS_ORIGIN (comma-separated origins).
 * - Explicit list: only those origins, with credentials.
 * - '*' or unset outside production: reflect any origin (local preview convenience).
 * - Production: '*' is rejected at boot (browsers refuse wildcard + credentials, and it would expose the API
 *   to every site); unset means same-origin only, which fits the web container proxying /api.
 */
export function buildCorsOptions(raw: string | undefined = process.env.CORS_ORIGIN): CorsOptions {
  const origins = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const wildcard = origins.length === 0 || origins.includes('*');

  if (isProduction() && origins.includes('*')) {
    throw new Error('CORS_ORIGIN="*" is not allowed when NODE_ENV=production; list explicit origins');
  }

  return {
    origin: wildcard ? !isProduction() : origins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  };
}
