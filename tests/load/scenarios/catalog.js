/**
 * Scenario: Product Catalog Browsing
 * Stage B — Catalog Read-Load Testing
 *
 * Simulates realistic e-commerce customer browsing patterns:
 * 1. Category taxonomy lookup
 * 2. Paginated product listing
 * 3. Category-filtered search
 * 4. Product detail page lookup
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, getProfileOptions } from '../k6.config.js';
import { catalogThresholds } from '../lib/thresholds.js';
import { generateCorrelationId, getRandomProduct, SEED_CATEGORIES } from '../lib/data.js';

export const options = getProfileOptions(catalogThresholds);

export default function () {
  const correlationId = generateCorrelationId('corr-catalog');
  const params = {
    headers: {
      'x-correlation-id': correlationId,
      Accept: 'application/json',
    },
    timeout: '8s',
  };

  group('Catalog Browsing Flow', function () {
    // 1. Fetch categories
    const resCategories = http.get(`${BASE_URL}/api/v1/products/categories`, params);
    check(resCategories, {
      'categories status is 200': (r) => r.status === 200,
      'categories returned list': (r) => {
        try {
          const body = JSON.parse(r.body);
          const list = body.data || body;
          return Array.isArray(list);
        } catch {
          return false;
        }
      },
    });

    sleep(0.2);

    // 2. Paginated product listing
    const resProducts = http.get(`${BASE_URL}/api/v1/products?page=1&limit=10`, params);
    check(resProducts, {
      'product list status is 200': (r) => r.status === 200,
      'product list has meta pagination': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Boolean((body.meta && typeof body.meta.total === 'number') || typeof body.total === 'number');
        } catch {
          return false;
        }
      },
    });

    sleep(0.3);

    // 3. Category-filtered listing
    const targetCategory = SEED_CATEGORIES[Math.floor(Math.random() * SEED_CATEGORIES.length)];
    const resFiltered = http.get(
      `${BASE_URL}/api/v1/products?categoryId=${targetCategory.id}&limit=5`,
      params,
    );
    check(resFiltered, {
      'category filter status is 200': (r) => r.status === 200,
    });

    sleep(0.3);

    // 4. Product detail lookup
    const targetProduct = getRandomProduct();
    const resDetail = http.get(`${BASE_URL}/api/v1/products/${targetProduct.id}`, params);
    check(resDetail, {
      'product detail status is 200': (r) => r.status === 200,
      'product detail matches requested ID': (r) => {
        try {
          const body = JSON.parse(r.body);
          const item = body.data || body;
          return item.id === targetProduct.id;
        } catch {
          return false;
        }
      },
    });
  });

  sleep(0.5);
}
