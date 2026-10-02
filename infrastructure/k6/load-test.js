import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Warm-up to 50 users
    { duration: '1m', target: 200 },   // Scale to 200 users
    { duration: '2m', target: 1000 },  // Peak load at 1,000 users
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],    // Error rate must be < 1%
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% of requests < 500ms, 99% < 1000ms
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000/api/v1';

export default function () {
  // 1. Health check probe
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
  });

  sleep(0.5);

  // 2. Browse products catalog
  const productsRes = http.get(`${BASE_URL}/products?limit=12`);
  check(productsRes, {
    'products catalog status is 200': (r) => r.status === 200,
    'has products in response': (r) => JSON.parse(r.body).data.length > 0,
  });

  sleep(1);

  // 3. Category filter
  const categoryRes = http.get(`${BASE_URL}/products?categorySlug=smartphones`);
  check(categoryRes, {
    'category filter status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
