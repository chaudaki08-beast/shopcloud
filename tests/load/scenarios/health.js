/**
 * Scenario: Health & Readiness Probes
 * Stage A — Safe Baseline & Smoke Tests
 *
 * Exercises GCP Cloud Run health and liveness probe endpoints.
 * Completely safe, zero-write, low overhead.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, getProfileOptions } from '../k6.config.js';
import { healthThresholds } from '../lib/thresholds.js';
import { generateCorrelationId } from '../lib/data.js';

export const options = getProfileOptions(healthThresholds);

export default function () {
  const correlationId = generateCorrelationId('corr-health');
  const params = {
    headers: {
      'x-correlation-id': correlationId,
      Accept: 'application/json',
    },
    timeout: '5s',
  };

  group('Health Check Probes', function () {
    // 1. Detailed health probe (/api/v1/health)
    const resHealth = http.get(`${BASE_URL}/api/v1/health`, params);
    check(resHealth, {
      'health probe status is 200 or 503': (r) => r.status === 200 || r.status === 503,
      'health response contains status field': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Boolean(body.status);
        } catch {
          return false;
        }
      },
    });

    // 2. High-frequency liveness probe (/api/v1/health/liveness)
    const resLiveness = http.get(`${BASE_URL}/api/v1/health/liveness`, params);
    check(resLiveness, {
      'liveness status is 200': (r) => r.status === 200,
      'liveness status is UP': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.status === 'UP';
        } catch {
          return false;
        }
      },
      'liveness latency under 150ms': (r) => r.timings.duration < 150,
    });
  });

  sleep(0.5);
}
