/**
 * Scenario: Authenticated Cart Operations
 * Stage C — Authenticated Cart Workflows
 *
 * Exercises authenticated cart mutation endpoints:
 * 1. Fetch current cart
 * 2. Add product to cart
 * 3. Update quantity
 * 4. Clean up / remove item
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, getProfileOptions } from '../k6.config.js';
import { cartThresholds } from '../lib/thresholds.js';
import { getAuthToken, buildAuthHeaders } from '../lib/auth.js';
import { getRandomProduct } from '../lib/data.js';

export const options = getProfileOptions(cartThresholds);

export function setup() {
  const token = getAuthToken(BASE_URL);
  return { token };
}

export default function (data) {
  const token = (data && data.token) || getAuthToken(BASE_URL);
  if (!token) {
    check(null, { 'authentication successful': () => false });
    return;
  }

  const product = getRandomProduct();

  group('Cart Lifecycle', function () {
    const headers = buildAuthHeaders(token, 'corr-cart');

    // 1. Get initial cart state
    const resGetInitial = http.get(`${BASE_URL}/api/v1/cart`, { headers, timeout: '5s' });
    check(resGetInitial, {
      'get cart status is 200': (r) => r.status === 200,
    });

    sleep(0.2);

    // 2. Add product to cart
    const addPayload = JSON.stringify({
      productId: product.id,
      quantity: 1,
    });
    const resAdd = http.post(`${BASE_URL}/api/v1/cart/items`, addPayload, {
      headers: buildAuthHeaders(token, 'corr-cart-add'),
      timeout: '6s',
    });
    check(resAdd, {
      'add to cart status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      'cart contains added item': (r) => {
        try {
          const body = JSON.parse(r.body);
          const responseData = body.data || body;
          return Array.isArray(responseData.items) && responseData.items.some((i) => i.productId === product.id);
        } catch {
          return false;
        }
      },
    });

    sleep(0.3);

    // 3. Update item quantity in cart
    const updatePayload = JSON.stringify({
      quantity: 2,
    });
    const resUpdate = http.patch(
      `${BASE_URL}/api/v1/cart/items/${product.id}`,
      updatePayload,
      {
        headers: buildAuthHeaders(token, 'corr-cart-update'),
        timeout: '6s',
      },
    );
    check(resUpdate, {
      'update cart item status is 200': (r) => r.status === 200,
    });

    sleep(0.2);

    // 4. Remove item from cart (hygiene cleanup)
    const resDelete = http.del(`${BASE_URL}/api/v1/cart/items/${product.id}`, null, {
      headers: buildAuthHeaders(token, 'corr-cart-del'),
      timeout: '6s',
    });
    check(resDelete, {
      'delete cart item status is 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);
}
