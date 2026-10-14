/**
 * ShopCloud Performance & Load Testing Suite
 * Authentication & Session Management Module
 */

import http from 'k6/http';
import { check } from 'k6';
import { generateCorrelationId } from './data.js';

// Cache per virtual user instance in memory to prevent hammering AuthRateLimiterGuard (10 req/min)
const tokenCache = {};

/**
 * Obtain a customer access token.
 * Uses environment credentials if supplied, otherwise falls back to deterministic dev demo customer.
 */
export function getAuthToken(baseUrl, forceRefresh = false) {
  const cacheKey = `customer-${baseUrl}`;
  if (!forceRefresh && tokenCache[cacheKey]) {
    return tokenCache[cacheKey];
  }

  const email = __ENV.SHOPCLOUD_TEST_EMAIL || 'customer@shopcloud.dev';
  const password = __ENV.SHOPCLOUD_TEST_PASSWORD || 'Password123!';

  const correlationId = generateCorrelationId('corr-auth-login');
  const payload = JSON.stringify({ email, password });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-correlation-id': correlationId,
    },
    timeout: '10s',
  };

  const res = http.post(`${baseUrl}/api/v1/auth/login`, payload, params);

  const ok = check(res, {
    'auth login status is 200': (r) => r.status === 200,
    'auth login returned token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Boolean(body.data && body.data.accessToken);
      } catch {
        return false;
      }
    },
  });

  if (!ok) {
    // Redact password from any diagnostic message
    console.error(`[Auth] Failed to authenticate user: ${email} (status: ${res.status})`);
    return null;
  }

  const body = JSON.parse(res.body);
  const token = body.data.accessToken;
  tokenCache[cacheKey] = token;
  return token;
}

/**
 * Obtain an admin access token for privileged operations.
 */
export function getAdminToken(baseUrl, forceRefresh = false) {
  const cacheKey = `admin-${baseUrl}`;
  if (!forceRefresh && tokenCache[cacheKey]) {
    return tokenCache[cacheKey];
  }

  const email = __ENV.SHOPCLOUD_ADMIN_EMAIL || 'admin@shopcloud.dev';
  const password = __ENV.SHOPCLOUD_ADMIN_PASSWORD || 'Password123!';

  const correlationId = generateCorrelationId('corr-auth-admin');
  const payload = JSON.stringify({ email, password });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-correlation-id': correlationId,
    },
    timeout: '10s',
  };

  const res = http.post(`${baseUrl}/api/v1/auth/login`, payload, params);

  const ok = check(res, {
    'admin auth status is 200': (r) => r.status === 200,
    'admin auth returned token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Boolean(body.data && body.data.accessToken);
      } catch {
        return false;
      }
    },
  });

  if (!ok) {
    console.error(`[Auth] Failed to authenticate admin: ${email} (status: ${res.status})`);
    return null;
  }

  const body = JSON.parse(res.body);
  const token = body.data.accessToken;
  tokenCache[cacheKey] = token;
  return token;
}

/**
 * Build request headers with Bearer token and correlation ID.
 */
export function buildAuthHeaders(token, customCorrelationPrefix = 'corr-k6-api') {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-correlation-id': generateCorrelationId(customCorrelationPrefix),
  };
}
