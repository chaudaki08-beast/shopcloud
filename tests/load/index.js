/**
 * ShopCloud Performance & Load Testing Suite
 * Unified Test Runner & Scenario Orchestrator
 */

import { sleep, group } from 'k6';
import { BASE_URL, getProfileOptions } from './k6.config.js';
import { defaultThresholds } from './lib/thresholds.js';

// Import individual scenario handlers
import healthScenario from './scenarios/health.js';
import catalogScenario from './scenarios/catalog.js';
import cartScenario from './scenarios/cart.js';
import checkoutScenario from './scenarios/checkout.js';
import orderLifecycleScenario from './scenarios/order-lifecycle.js';
import eventProcessingScenario from './scenarios/event-processing.js';

export const options = getProfileOptions(defaultThresholds);

export default function () {
  const scenario = (__ENV.SCENARIO || 'smoke').toLowerCase();

  switch (scenario) {
    case 'health':
      healthScenario();
      break;

    case 'catalog':
      catalogScenario();
      break;

    case 'cart':
      cartScenario();
      break;

    case 'checkout':
      checkoutScenario();
      break;

    case 'lifecycle':
    case 'order-lifecycle':
      orderLifecycleScenario();
      break;

    case 'events':
    case 'event-processing':
      eventProcessingScenario();
      break;

    case 'smoke':
    case 'all':
    default:
      group('Combined Smoke & Catalog Suite', function () {
        healthScenario();
        sleep(0.2);
        catalogScenario();
        sleep(0.2);
        eventProcessingScenario();
      });
      break;
  }
}
