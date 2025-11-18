/**
 * API Client Configuration Constants
 *
 * Centralized configuration for API client behavior, error handling,
 * and retry strategies. Extracted from APIClient class to improve
 * maintainability and establish single source of truth.
 */

const API_CLIENT_CONFIG = {
  BASE_URL: 'https://api.scrape-creators.com',
  ENDPOINT: '/transcript',
  TIMEOUT_MS: 30000,
  API_KEY_HEADER: 'x-api-key',
  MAX_API_KEY_LENGTH: 500
};

const ERROR_TYPES = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  VALIDATION: 'VALIDATION',
  UNKNOWN_HTTP_ERROR: 'UNKNOWN_HTTP_ERROR'
};

const TIMEOUT_ERROR_CODES = ['ECONNABORTED', 'ETIMEDOUT'];

const NETWORK_ERROR_CODES = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ENETUNREACH',
  'EAI_AGAIN',
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
];

const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  BACKOFF_MULTIPLIER: 2,
  JITTER_PERCENT: 0.25,
  MAX_DELAY_MS: 8000,
  MIN_DELAY_MS: 100
};

const RETRY_BUDGET = {
  MAX_TOTAL_RETRY_TIME_MS: 60000,
  MAX_RETRY_AFTER_SECONDS: 300
};

module.exports = {
  API_CLIENT_CONFIG,
  ERROR_TYPES,
  TIMEOUT_ERROR_CODES,
  NETWORK_ERROR_CODES,
  RETRY_CONFIG,
  RETRY_BUDGET
};
