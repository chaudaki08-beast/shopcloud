/**
 * Scenario: Event-Driven Workload & Webhook Idempotency
 * Stage D — Event-Driven Workload Validation
 *
 * 1. Submit authentic HMAC-SHA256 signed test payment webhook
 * 2. Invariant: Re-submit identical webhook event ID (verify idempotency / duplicate ignored)
 * 3. Security: Submit webhook with invalid HMAC signature (verify 401 Unauthorized)
 * 4. Probe background worker health if WORKER_BASE_URL is configured
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, getProfileOptions } from '../k6.config.js';
import { eventProcessingThresholds } from '../lib/thresholds.js';
import { createSignedWebhookPayload, generateCorrelationId } from '../lib/data.js';

export const options = getProfileOptions(eventProcessingThresholds);

const WORKER_BASE_URL = __ENV.WORKER_BASE_URL || '';

export default function () {
  const fakeOrderId = `ord_test_${Date.now()}`;
  const fakeProviderRef = `test_ref_${fakeOrderId}`;

  group('Webhook Processing & Idempotency', function () {
    // 1. Inbound valid signed payment webhook
    const signedData = createSignedWebhookPayload(fakeOrderId, fakeProviderRef, 'PAYMENT_SUCCESS');
    const resWebhook = http.post(
      `${BASE_URL}/api/v1/payments/webhook/TEST_SANDBOX`,
      signedData.rawBody,
      {
        headers: signedData.headers,
        timeout: '6s',
      },
    );

    check(resWebhook, {
      'webhook accepted with status 200': (r) => r.status === 200,
    });

    sleep(0.1);

    // 2. Invariant: Duplicate webhook submission (Idempotency check)
    // Sending the exact same payload (same event.id) must succeed without error
    const resDuplicate = http.post(
      `${BASE_URL}/api/v1/payments/webhook/TEST_SANDBOX`,
      signedData.rawBody,
      {
        headers: signedData.headers,
        timeout: '6s',
      },
    );

    check(resDuplicate, {
      'duplicate webhook handled idempotently (status 200)': (r) => r.status === 200,
    });

    sleep(0.1);

    // 3. Security: Webhook with forged/invalid signature
    const forgedHeaders = {
      'Content-Type': 'application/json',
      'x-shopcloud-test-signature': 'forged_invalid_signature_hex_0000000000000000',
      'x-correlation-id': generateCorrelationId('corr-forged-webhook'),
    };

    const resForged = http.post(
      `${BASE_URL}/api/v1/payments/webhook/TEST_SANDBOX`,
      signedData.rawBody,
      {
        headers: forgedHeaders,
        timeout: '6s',
        responseCallback: http.expectedStatuses(401),
      },
    );

    check(resForged, {
      'forged signature rejected with status 401': (r) => r.status === 401,
    });

    // 4. Optional: Worker service health probe (if URL provided)
    if (WORKER_BASE_URL) {
      const resWorkerHealth = http.get(`${WORKER_BASE_URL}/health`, { timeout: '5s' });
      check(resWorkerHealth, {
        'worker health probe is 200': (r) => r.status === 200,
      });
    }
  });

  sleep(0.4);
}
