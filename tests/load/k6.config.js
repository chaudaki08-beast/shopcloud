/**
 * ShopCloud Performance & Load Testing Suite
 * Centralized Configuration & Load Profile Engine
 */

export const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
export const PROFILE = (__ENV.PROFILE || 'smoke').toLowerCase();

/**
 * Validates target environment against safety rules.
 * Strictly prevents running unapproved high-volume traffic against live Cloud Run endpoints.
 */
export function validateTargetSafety(baseUrl, profile) {
  const isCloudEndpoint =
    baseUrl.includes('run.app') ||
    baseUrl.includes('shopcloud.dev') ||
    baseUrl.includes('googleusercontent.com');

  if (isCloudEndpoint) {
    if (profile === 'stress') {
      throw new Error(
        `[SAFETY VIOLATION] Stress profile is BLOCKED against cloud environment (${baseUrl}). Zero-cost policy prohibits unapproved heavy load.`,
      );
    }
    if (profile === 'moderate' && __ENV.ALLOW_LIVE_LOAD_TEST !== 'true') {
      throw new Error(
        `[SAFETY VIOLATION] Moderate load profile against cloud endpoint requires explicit opt-in: ALLOW_LIVE_LOAD_TEST=true.`,
      );
    }
  }
}

/**
 * Profile 1: Smoke Test
 * - 1-2 Virtual Users
 * - 30s duration
 * - Minimal request count, immediate sanity validation
 */
export const smokeProfile = {
  vus: 1,
  duration: '30s',
};

/**
 * Profile 2: Baseline Performance Profile
 * - 5 concurrent Virtual Users
 * - 2m duration
 * - Realistic user pacing, read-heavy catalog operations
 */
export const baselineProfile = {
  stages: [
    { duration: '20s', target: 5 },  // Warm-up ramp
    { duration: '80s', target: 5 },  // Steady state
    { duration: '20s', target: 0 },  // Cool-down ramp
  ],
};

/**
 * Profile 3: Moderate Load Profile (Approved test env only)
 * - 10-15 Virtual Users
 * - 3m duration
 * - Validates concurrency scaling
 */
export const moderateProfile = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '120s', target: 15 },
    { duration: '30s', target: 0 },
  ],
};

/**
 * Profile 4: Stress Profile (Disabled by default, requires explicit approval)
 * - Maximum 25 Virtual Users
 * - Hard cap 3m
 */
export const stressProfile = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '60s', target: 25 },
    { duration: '60s', target: 25 },
    { duration: '30s', target: 0 },
  ],
};

/**
 * Resolve k6 options based on PROFILE environment variable.
 */
export function getProfileOptions(customThresholds = {}) {
  validateTargetSafety(BASE_URL, PROFILE);

  let profileConfig;
  switch (PROFILE) {
    case 'baseline':
      profileConfig = baselineProfile;
      break;
    case 'moderate':
      profileConfig = moderateProfile;
      break;
    case 'stress':
      if (__ENV.ALLOW_STRESS_TEST !== 'true') {
        console.warn('Stress profile requested without ALLOW_STRESS_TEST=true. Falling back to baseline.');
        profileConfig = baselineProfile;
      } else {
        profileConfig = stressProfile;
      }
      break;
    case 'smoke':
    default:
      profileConfig = smokeProfile;
      break;
  }

  return {
    ...profileConfig,
    thresholds: customThresholds,
    userAgent: 'ShopCloud-k6-Performance-Test/1.5.0',
    noConnectionReuse: false,
    insecureSkipTLSVerify: true,
  };
}
