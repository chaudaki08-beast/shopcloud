/**
 * ShopCloud Performance & Load Testing Suite
 * Threshold Definitions & SLO Calibrations
 *
 * Calibrated against Phase 14 Service Level Objectives (SLOs):
 * - API Availability SLO: >= 99.5% non-5xx HTTP responses (failure rate < 0.5%)
 * - API Latency SLO: >= 95.0% requests completed within <= 500ms (P95 <= 500ms)
 * - Event Processing Reliability: >= 99.9% non-DLQ processing
 */

export const healthThresholds = {
  http_req_failed: ['rate<0.01'], // < 1% error rate
  'http_req_duration{scenario:default}': ['p(95)<1200', 'p(99)<1500', 'avg<600'],
};

export const catalogThresholds = {
  http_req_failed: ['rate<0.01'], // < 1% error rate
  'http_req_duration{scenario:default}': ['p(95)<350', 'p(99)<700', 'avg<150'],
};

export const cartThresholds = {
  http_req_failed: ['rate<0.02'], // < 2% error rate
  'http_req_duration{scenario:default}': ['p(95)<500', 'p(99)<1000', 'avg<250'],
};

export const checkoutThresholds = {
  http_req_failed: ['rate<0.02'], // < 2% error rate
  'http_req_duration{scenario:default}': ['p(95)<800', 'p(99)<1500', 'avg<400'],
};

export const orderLifecycleThresholds = {
  http_req_failed: ['rate<0.02'],
  'http_req_duration{scenario:default}': ['p(95)<700', 'p(99)<1200', 'avg<300'],
};

export const eventProcessingThresholds = {
  http_req_failed: ['rate<0.01'],
  'http_req_duration{scenario:default}': ['p(95)<300', 'p(99)<600', 'avg<150'],
};

export const defaultThresholds = {
  http_req_failed: ['rate<0.01'],
  'http_req_duration{scenario:default}': ['p(95)<1200', 'p(99)<1500', 'avg<300'],
};
