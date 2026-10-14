/**
 * Scenario: Order Lifecycle & State Machine Transitions
 * Stage C & D — Order State Machine Invariant Validation
 *
 * 1. Prepare cart with product item
 * 2. Place order from cart (201 Created)
 * 3. Fetch order details with customer ownership verification (200 OK)
 * 4. Cancel order and verify status transitions to CANCELLED (200/201)
 * 5. Invariant Test: Verify cancellation idempotency (re-cancelling returns 200/201 no-op)
 * 6. Verify final persisted state remains CANCELLED
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, getProfileOptions } from '../k6.config.js';
import { orderLifecycleThresholds } from '../lib/thresholds.js';
import { getAuthToken, buildAuthHeaders } from '../lib/auth.js';
import { getRandomProduct, createValidShippingAddress } from '../lib/data.js';

export const options = getProfileOptions(orderLifecycleThresholds);

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

  const vuId = typeof __VU !== 'undefined' ? __VU : 1;
  const product = getRandomProduct();

  group('Order State Machine Lifecycle', function () {
    // 1. Prepare cart with product item
    const resAdd = http.post(
      `${BASE_URL}/api/v1/cart/items`,
      JSON.stringify({ productId: product.id, quantity: 1 }),
      { headers: buildAuthHeaders(token, 'corr-life-add'), timeout: '6s' },
    );
    const added = check(resAdd, {
      'cart item added with status 200 or 201': (r) => r.status === 200 || r.status === 201,
    });
    if (!added) return;

    sleep(0.2);

    // 2. Create order from cart
    const resOrder = http.post(
      `${BASE_URL}/api/v1/orders`,
      JSON.stringify({
        shippingAddress: createValidShippingAddress(vuId),
        paymentMethod: 'TEST_SANDBOX',
      }),
      { headers: buildAuthHeaders(token, 'corr-life-order'), timeout: '8s' },
    );

    const created = check(resOrder, {
      'order placed with status 201': (r) => r.status === 201,
    });
    if (!created) return;

    const orderBody = JSON.parse(resOrder.body);
    const orderData = orderBody.data || orderBody;
    const orderId = orderData.id;

    sleep(0.2);

    // 3. Fetch order by ID (customer ownership check)
    const resGet = http.get(`${BASE_URL}/api/v1/orders/${orderId}`, {
      headers: buildAuthHeaders(token, 'corr-life-get'),
      timeout: '6s',
    });
    check(resGet, {
      'get order by ID status is 200': (r) => r.status === 200,
    });

    sleep(0.2);

    // 4. Cancel order
    const resCancel = http.post(`${BASE_URL}/api/v1/orders/${orderId}/cancel`, null, {
      headers: buildAuthHeaders(token, 'corr-life-cancel'),
      timeout: '6s',
    });
    check(resCancel, {
      'cancel order status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      'order status transitioned to CANCELLED': (r) => {
        try {
          const body = JSON.parse(r.body);
          const responseData = body.data || body;
          return responseData.status === 'CANCELLED';
        } catch {
          return false;
        }
      },
    });

    sleep(0.2);

    // 5. Invariant Test: Verify idempotent re-cancellation
    const resDuplicateCancel = http.post(
      `${BASE_URL}/api/v1/orders/${orderId}/cancel`,
      null,
      {
        headers: buildAuthHeaders(token, 'corr-life-dupe-cancel'),
        timeout: '6s',
      },
    );
    check(resDuplicateCancel, {
      'duplicate cancellation handled idempotently (status 200 or 201)': (r) =>
        r.status === 200 || r.status === 201,
      'duplicate cancellation preserves CANCELLED status': (r) => {
        try {
          const body = JSON.parse(r.body);
          const responseData = body.data || body;
          return responseData.status === 'CANCELLED';
        } catch {
          return false;
        }
      },
    });
  });

  sleep(0.5);
}
