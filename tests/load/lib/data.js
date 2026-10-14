/**
 * ShopCloud Performance & Load Testing Suite
 * Test Data, Fixtures & Utilities
 */

import crypto from 'k6/crypto';

export const SEED_PRODUCTS = [
  { id: 'prod-s25-ultra', sku: 'SAM-S25-512-TI', name: 'Samsung Galaxy S25 Ultra 5G', categoryId: 'cat-smartphones' },
  { id: 'prod-ip16-pro', sku: 'APL-IP16PM-256-DES', name: 'Apple iPhone 16 Pro Max', categoryId: 'cat-smartphones' },
  { id: 'prod-mbp-16', sku: 'APL-MBP16-M4M-36G', name: 'MacBook Pro 16" (M4 Max)', categoryId: 'cat-laptops' },
  { id: 'prod-xps-16', sku: 'DEL-XPS16-U9-32G', name: 'Dell XPS 16 OLED Developer Edition', categoryId: 'cat-laptops' },
  { id: 'prod-wh1000xm5', sku: 'SNY-WH1000XM5-SLV', name: 'Sony WH-1000XM5 Wireless Headphones', categoryId: 'cat-audio' },
];

export const SEED_CATEGORIES = [
  { id: 'cat-smartphones', slug: 'smartphones', name: 'Smartphones' },
  { id: 'cat-laptops', slug: 'laptops', name: 'Laptops' },
  { id: 'cat-audio', slug: 'audio', name: 'Audio & Wearables' },
];

/**
 * Generate a unique correlation ID traceable across logs and traces.
 */
export function generateCorrelationId(prefix = 'corr-k6') {
  const vu = typeof __VU !== 'undefined' ? __VU : 1;
  const iter = typeof __ITER !== 'undefined' ? __ITER : 0;
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}-v${vu}-i${iter}-${Date.now()}-${rand}`;
}

/**
 * Get random product from seeded list.
 */
export function getRandomProduct() {
  const index = Math.floor(Math.random() * SEED_PRODUCTS.length);
  return SEED_PRODUCTS[index];
}

/**
 * Valid shipping address input matching CreateOrderDto.
 */
export function createValidShippingAddress(vuId = 1) {
  return {
    recipientName: `Perf Customer ${vuId}`,
    phoneNumber: `+91 98765${String(10000 + (vuId % 90000)).padStart(5, '0')}`,
    street: `${vuId * 10} Performance Boulevard, Suite ${vuId}`,
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'India',
  };
}

/**
 * Generate HMAC-SHA256 signed test webhook payload for TestPaymentAdapter.
 */
export function createSignedWebhookPayload(
  orderId,
  providerRef,
  event = 'PAYMENT_SUCCESS',
  secret = 'test_webhook_secret_key_123'
) {
  const payload = {
    event,
    id: `evt_k6_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    orderId,
    providerRef: providerRef || `test_ref_${orderId}_${Date.now()}`,
    amount: 13805894,
    currency: 'INR',
    timestamp: new Date().toISOString(),
  };

  const rawBody = JSON.stringify(payload);
  const signature = crypto.hmac('sha256', secret, rawBody, 'hex');

  return {
    rawBody,
    payload,
    headers: {
      'Content-Type': 'application/json',
      'x-shopcloud-test-signature': signature,
      'x-correlation-id': generateCorrelationId('corr-webhook'),
    },
  };
}
