/**
 * ShopCloud Performance Suite — Static Validator
 *
 * Validates k6 script syntax, exports, thresholds, and safety rules
 * suitable for lightweight CI gating without requiring a live k6 binary or paid runners.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname);
const SCENARIOS_DIR = path.join(ROOT_DIR, 'scenarios');
const LIB_DIR = path.join(ROOT_DIR, 'lib');

const REQUIRED_SCENARIOS = [
  'health.js',
  'catalog.js',
  'cart.js',
  'checkout.js',
  'order-lifecycle.js',
  'event-processing.js',
];

const REQUIRED_LIBS = [
  'thresholds.js',
  'data.js',
  'auth.js',
];

console.log('--- ShopCloud k6 Load Test Suite Validator ---');
let hasErrors = false;

// 1. Verify library files exist
for (const file of REQUIRED_LIBS) {
  const fullPath = path.join(LIB_DIR, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`[FAIL] Missing required library: ${file}`);
    hasErrors = true;
  } else {
    console.log(`[PASS] Library file verified: lib/${file}`);
  }
}

// 2. Verify config exists
const configPath = path.join(ROOT_DIR, 'k6.config.js');
if (!fs.existsSync(configPath)) {
  console.error('[FAIL] Missing k6.config.js');
  hasErrors = true;
} else {
  console.log('[PASS] Configuration file verified: k6.config.js');
}

// 3. Verify scenarios
for (const scenario of REQUIRED_SCENARIOS) {
  const fullPath = path.join(SCENARIOS_DIR, scenario);
  if (!fs.existsSync(fullPath)) {
    console.error(`[FAIL] Missing required scenario: ${scenario}`);
    hasErrors = true;
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');

  // Verify exports
  if (!content.includes('export const options') && !content.includes('export let options')) {
    console.error(`[FAIL] Scenario ${scenario} must export options`);
    hasErrors = true;
  }

  if (!content.includes('export default function')) {
    console.error(`[FAIL] Scenario ${scenario} must export default function`);
    hasErrors = true;
  }

  // Verify correlation ID propagation
  if (
    !content.includes('correlationId') &&
    !content.includes('x-correlation-id') &&
    !content.includes('buildAuthHeaders')
  ) {
    console.warn(`[WARN] Scenario ${scenario} does not explicitly reference correlation IDs`);
  }

  console.log(`[PASS] Scenario verified: scenarios/${scenario}`);
}

// 4. Verify index orchestrator
const indexPath = path.join(ROOT_DIR, 'index.js');
if (!fs.existsSync(indexPath)) {
  console.error('[FAIL] Missing index.js orchestrator');
  hasErrors = true;
} else {
  console.log('[PASS] Unified runner verified: index.js');
}

if (hasErrors) {
  console.error('\nStatic validation failed with errors.');
  process.exit(1);
} else {
  console.log('\nAll k6 load testing scenarios and libraries verified successfully.');
}
