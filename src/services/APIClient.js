const axios = require('axios');
const {
  API_CLIENT_CONFIG,
  ERROR_TYPES,
  TIMEOUT_ERROR_CODES,
  NETWORK_ERROR_CODES,
  RETRY_CONFIG,
  RETRY_BUDGET
} = require('../constants/APIClientConstants');
const ErrorHandler = require('../utils/ErrorHandler');
const ValidationHelpers = require('../utils/ValidationHelpers');
const URLValidator = require('../utils/URLValidator');

/**
 * API Client for Scrape Creators Service
 *
 * Handles HTTP communication with transcript extraction API
 * Implements FR-2.1 transcript acquisition requirements
 * Configured per TR-11 API key management specifications
 *
 * ERROR CLASSIFICATION (TR-12):
 *   400 -> INVALID_REQUEST (skip URL, continue)
 *   401 -> UNAUTHORIZED (throw, caller exits)
 *   429 -> RATE_LIMITED (retry with exponential backoff, max 3 attempts)
 *   500/502/503 -> SERVER_ERROR (skip URL, continue)
 *   ETIMEDOUT -> TIMEOUT (skip URL, continue)
 *   ECONNREFUSED/etc -> NETWORK (skip URL, continue)
 *
 * RETRY STRATEGY (FR-10.1, TR-12):
 *   - Exponential backoff: 1s, 2s, 4s (with ±25% jitter)
 *   - Retry-After header respected when provided
 *   - Request deduplication prevents duplicate concurrent requests
 *   - Retry budget enforcement prevents resource exhaustion
 *   - Maximum 3 total attempts (1 initial + 2 retries)
 *
 * SECURITY CONSIDERATIONS:
 *   - API key never logged or exposed in errors
 *   - HTTPS-only communication enforced
 *   - Response data sanitized in error contexts
 *   - Rate limit headers respected with security bounds
 *   - Retry-After header validated to prevent DoS attacks
 *
 * @class APIClient
 */
class APIClient {
  /**
   * @param {string} apiKey - Scrape Creators API key from environment
   */
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.httpClient = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.inflightRequests = new Map();
    this.activeTimeouts = new Set();
    this.retryBudgetStartTime = null;
  }

  /**
   * Initialize API client with authentication and configuration
   * Must be called before fetchTranscript
   * Validates API key and creates HTTP client
   *
   * @returns {Promise<void>}
   * @throws {Error} If API key missing, invalid format, or too long
   */
  async initialize() {
    if (this.initialized) return;

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      const originalApiKey = this.apiKey;

      try {
        this.validateApiKey();
        this.httpClient = this.createHttpClient();
        this.initialized = true;
      } catch (error) {
        this.apiKey = originalApiKey;
        this.httpClient = null;
        this.initialized = false;
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Validate API key format and presence
   * @private
   * @throws {Error} If API key invalid
   */
  validateApiKey() {
    const trimmedKey = ValidationHelpers.validateRequiredString(this.apiKey, 'API key');

    if (trimmedKey.length > API_CLIENT_CONFIG.MAX_API_KEY_LENGTH) {
      throw new Error('API key exceeds maximum length (possible paste error)');
    }

    this.apiKey = trimmedKey;
  }

  /**
   * Create configured axios instance
   * @private
   * @returns {AxiosInstance} Configured HTTP client
   */
  createHttpClient() {
    const client = axios.create({
      baseURL: API_CLIENT_CONFIG.BASE_URL,
      timeout: API_CLIENT_CONFIG.TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        [API_CLIENT_CONFIG.API_KEY_HEADER]: this.apiKey
      },
      validateStatus: (status) => status >= 200 && status < 300,
      maxRedirects: 0,
      decompress: true
    });

    this.attachInterceptors(client);
    return client;
  }

  /**
   * Attach request and response interceptors
   * @private
   * @param {AxiosInstance} client - Axios instance to configure
   */
  attachInterceptors(client) {
    client.interceptors.request.use(
      this.handleSuccessfulRequest.bind(this),
      this.handleFailedRequest.bind(this)
    );

    client.interceptors.response.use(
      this.handleSuccessfulResponse.bind(this),
      this.handleFailedResponse.bind(this)
    );
  }

  /**
   * Handle successful request in interceptor
   * @private
   * @param {Object} config - Axios request config
   * @returns {Object} Unchanged config
   */
  handleSuccessfulRequest(config) {
    const requestUrl = config.url || config.baseURL;
    const requestMethod = config.method?.toUpperCase() || 'REQUEST';

    console.log(`[API] ${requestMethod} ${requestUrl}`);

    return config;
  }

  /**
   * Handle failed request in interceptor
   * @private
   * @param {Error} error - Request error
   * @returns {Promise<never>} Rejected promise
   */
  handleFailedRequest(error) {
    const errorMessage = error?.message || String(error) || 'Unknown error';

    console.error('[API] Request preparation failed:', errorMessage);

    return Promise.reject(error);
  }

  /**
   * Handle successful response in interceptor
   * @private
   * @param {Object} response - Axios response
   * @returns {Object} Unchanged response
   */
  handleSuccessfulResponse(response) {
    const responseUrl = response.config?.url || response.config?.baseURL || '[unknown]';
    const responseStatus = response.status || '[no status]';

    console.log(`[API] Response ${responseStatus} from ${responseUrl}`);

    return response;
  }

  /**
   * Handle failed response in interceptor
   * @private
   * @param {Error} error - Response error
   * @returns {Promise<never>} Rejected promise with transformed error
   */
  handleFailedResponse(error) {
    return Promise.reject(this.transformError(error));
  }

  /**
   * Ensure client initialized before operations
   * @private
   * @throws {Error} If initialization fails
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Fetch transcript for YouTube video with automatic retry on rate limit
   * Enhanced with deduplication and budget tracking
   * @param {string} videoUrl - Full YouTube URL
   * @returns {Promise<string>} Transcript text
   * @throws {Error} On API errors, network failures, or invalid response
   */
  async fetchTranscript(videoUrl) {
    await this.ensureInitialized();
    this.validateVideoUrl(videoUrl);

    const videoId = URLValidator.extractVideoId(videoUrl);
    const startTime = Date.now();

    console.log(`[API] Fetching transcript for video: ${videoId}`);

    if (this.inflightRequests.has(videoId)) {
      console.log(`[API] Deduplicating request for ${videoId}`);
      return this.inflightRequests.get(videoId);
    }

    const requestPromise = this.fetchWithRetry(videoUrl)
      .then(transcript => {
        const duration = Date.now() - startTime;
        console.log(`[API] Transcript received: ${transcript.length} chars in ${duration}ms`);
        return transcript;
      })
      .finally(() => {
        this.inflightRequests.delete(videoId);
        this.retryBudgetStartTime = null;
      });

    this.inflightRequests.set(videoId, requestPromise);
    return requestPromise;
  }

  /**
   * Execute API request with exponential backoff retry
   * @private
   * @param {string} videoUrl - YouTube URL
   * @param {number} attempt - Current attempt number (1-indexed)
   * @param {number} budgetStartTime - Timestamp when retry sequence started
   * @returns {Promise<string>} Transcript text
   */
  async fetchWithRetry(videoUrl, attempt = 1, budgetStartTime = null) {
    const startTime = this.initializeRetryTracking(attempt, budgetStartTime);

    try {
      return await this.executeApiRequest(videoUrl);
    } catch (error) {
      return await this.handleRetryOrThrow(error, videoUrl, attempt, startTime);
    }
  }

  /**
   * Initialize retry tracking on first attempt
   * @private
   * @param {number} attempt - Current attempt number
   * @param {number} budgetStartTime - Existing start time or null
   * @returns {number} Budget start timestamp
   */
  initializeRetryTracking(attempt, budgetStartTime) {
    if (attempt === 1) {
      const startTime = Date.now();
      this.retryBudgetStartTime = startTime;
      return startTime;
    }
    return budgetStartTime;
  }

  /**
   * Execute single API request
   * @private
   * @param {string} videoUrl - YouTube URL
   * @returns {Promise<string>} Transcript text
   */
  async executeApiRequest(videoUrl) {
    const response = await this.httpClient.post(
      API_CLIENT_CONFIG.ENDPOINT,
      { url: videoUrl }
    );

    if (!response) {
      throw this.createAppError(
        ERROR_TYPES.VALIDATION,
        'API returned null response object'
      );
    }

    return this.extractTranscriptText(response);
  }

  /**
   * Handle retry logic or throw error
   * @private
   * @param {Error} error - Caught error
   * @param {string} videoUrl - YouTube URL
   * @param {number} attempt - Current attempt
   * @param {number} startTime - Budget start time
   * @returns {Promise<string>} Transcript text from retry
   */
  async handleRetryOrThrow(error, videoUrl, attempt, startTime) {
    if (!this.shouldRetry(error, attempt)) {
      throw error;
    }

    this.enforceRetryBudget(startTime);
    const delayMs = this.calculateRetryDelay(error, attempt);

    this.logRetryAttempt(attempt, delayMs, startTime);

    await this.sleepWithCleanup(delayMs);

    return this.fetchWithRetry(videoUrl, attempt + 1, startTime);
  }

  /**
   * Check if error should be retried
   * @private
   * @param {Error} error - Error to check
   * @param {number} attempt - Current attempt number
   * @returns {boolean} True if should retry
   */
  shouldRetry(error, attempt) {
    return ErrorHandler.isRetriableError(error) && attempt < RETRY_CONFIG.MAX_ATTEMPTS;
  }

  /**
   * Log retry attempt details
   * @private
   * @param {number} attempt - Current attempt number
   * @param {number} delayMs - Delay in milliseconds
   * @param {number} startTime - Budget start time
   */
  logRetryAttempt(attempt, delayMs, startTime) {
    const elapsedMs = Date.now() - startTime;
    const maxRetries = RETRY_CONFIG.MAX_ATTEMPTS - 1;

    console.warn(
      `[API] Rate limited. Retry ${attempt}/${maxRetries} ` +
      `after ${delayMs}ms (total elapsed: ${elapsedMs}ms)`
    );
  }

  /**
   * Calculate delay with exponential backoff and jitter
   * @private
   * @param {Error} error - Application error with context
   * @param {number} attempt - Current attempt number (1-indexed)
   * @returns {number} Delay in milliseconds (always positive integer)
   */
  calculateRetryDelay(error, attempt) {
    const retryAfterSeconds = this.validateRetryAfter(error.context?.retryAfter);

    if (retryAfterSeconds !== null) {
      return this.useServerProvidedDelay(retryAfterSeconds);
    }

    return this.calculateExponentialBackoff(attempt);
  }

  /**
   * Use server-provided retry delay
   * @private
   * @param {number} retryAfterSeconds - Retry-After header value in seconds
   * @returns {number} Delay in milliseconds
   */
  useServerProvidedDelay(retryAfterSeconds) {
    if (retryAfterSeconds === 0) {
      console.warn('[API] Server requested immediate retry - applying minimum delay');
      return this.applyJitter(RETRY_CONFIG.MIN_DELAY_MS);
    }

    const delayMs = retryAfterSeconds * 1000;
    console.log(`[API] Using server-provided Retry-After: ${retryAfterSeconds}s`);
    return Math.round(delayMs);
  }

  /**
   * Calculate exponential backoff delay
   * @private
   * @param {number} attempt - Current attempt number
   * @returns {number} Delay in milliseconds with jitter
   */
  calculateExponentialBackoff(attempt) {
    const baseDelay = Math.round(
      RETRY_CONFIG.INITIAL_DELAY_MS *
      Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt - 1)
    );

    const cappedDelay = Math.min(baseDelay, RETRY_CONFIG.MAX_DELAY_MS);

    return this.applyJitter(cappedDelay);
  }

  /**
   * Validate and sanitize Retry-After header value
   * @private
   * @param {string|number} retryAfter - Raw header value
   * @returns {number|null} Validated seconds or null if invalid
   */
  validateRetryAfter(retryAfter) {
    if (!retryAfter) return null;

    const retryAfterSeconds = parseInt(retryAfter, 10);

    if (isNaN(retryAfterSeconds) || retryAfterSeconds < 0) {
      console.warn(`[API] Invalid Retry-After header: ${retryAfter}`);
      return null;
    }

    if (retryAfterSeconds > RETRY_BUDGET.MAX_RETRY_AFTER_SECONDS) {
      console.warn(
        `[API] Retry-After ${retryAfterSeconds}s exceeds maximum ` +
        `${RETRY_BUDGET.MAX_RETRY_AFTER_SECONDS}s - capping`
      );
      return RETRY_BUDGET.MAX_RETRY_AFTER_SECONDS;
    }

    return retryAfterSeconds;
  }

  /**
   * Apply random jitter to prevent thundering herd
   * @private
   * @param {number} delayMs - Base delay in milliseconds
   * @returns {number} Jittered delay (positive integer)
   */
  applyJitter(delayMs) {
    const jitterRange = delayMs * RETRY_CONFIG.JITTER_PERCENT;

    const min = delayMs - jitterRange;
    const max = delayMs + jitterRange;
    const jittered = Math.random() * (max - min) + min;

    return Math.max(1, Math.round(jittered));
  }

  /**
   * Sleep for specified milliseconds with cleanup tracking
   * @private
   * @param {number} delayMilliseconds - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleepWithCleanup(delayMilliseconds) {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.activeTimeouts.delete(timeoutId);
        resolve();
      }, delayMilliseconds);

      this.activeTimeouts.add(timeoutId);
    });
  }

  /**
   * Enforce retry budget to prevent cascading failures
   * @private
   * @param {number} startTime - Timestamp when retry sequence started
   * @throws {Error} If retry budget exhausted
   */
  enforceRetryBudget(startTime) {
    const elapsed = Date.now() - startTime;

    if (elapsed > RETRY_BUDGET.MAX_TOTAL_RETRY_TIME_MS) {
      throw this.createAppError(
        ERROR_TYPES.RATE_LIMITED,
        `Retry budget exhausted after ${elapsed}ms - too many consecutive rate limits`,
        { elapsedMs: elapsed, budgetMs: RETRY_BUDGET.MAX_TOTAL_RETRY_TIME_MS }
      );
    }
  }

  /**
   * Clean up active timeouts on process shutdown
   * @public
   */
  cleanup() {
    console.log(`[API] Cleaning up ${this.activeTimeouts.size} active timeout(s)`);

    for (const timeoutId of this.activeTimeouts) {
      clearTimeout(timeoutId);
    }

    this.activeTimeouts.clear();
    this.inflightRequests.clear();
  }

  /**
   * Validate YouTube URL format before API call
   * @private
   * @param {string} url - URL to validate
   * @throws {Error} If URL invalid or empty
   */
  validateVideoUrl(url) {
    if (!ValidationHelpers.isNonEmptyString(url)) {
      throw this.createAppError(
        ERROR_TYPES.VALIDATION,
        'Video URL is required and must be non-empty string'
      );
    }

    const MAX_URL_LENGTH = 2083;
    if (url.length > MAX_URL_LENGTH) {
      throw this.createAppError(
        ERROR_TYPES.VALIDATION,
        `Video URL exceeds maximum length (${MAX_URL_LENGTH} characters)`
      );
    }

    const youtubePattern = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//;
    if (!youtubePattern.test(url)) {
      const urlPreview = url.length > 100 ? url.substring(0, 100) + '...' : url;
      throw this.createAppError(
        ERROR_TYPES.VALIDATION,
        'Invalid YouTube URL format',
        { url: urlPreview }
      );
    }
  }

  /**
   * Extract transcript text from API response
   * @private
   * @param {Object} response - Axios response object
   * @returns {string} Transcript text
   * @throws {Error} If response missing expected fields
   */
  extractTranscriptText(response) {
    if (!response || !response.data ||
        response.data === null ||
        typeof response.data !== 'object' ||
        Array.isArray(response.data)) {
      throw this.createAppError(
        ERROR_TYPES.VALIDATION,
        'API response missing data object'
      );
    }

    if (!('transcript_only_text' in response.data)) {
      throw this.createAppError(
        ERROR_TYPES.VALIDATION,
        'API response missing transcript_only_text field'
      );
    }

    const text = response.data.transcript_only_text;

    if (typeof text !== 'string') {
      throw this.createAppError(
        ERROR_TYPES.VALIDATION,
        `API response transcript_only_text must be string, got ${typeof text}`
      );
    }

    const trimmedText = text.trim();

    if (trimmedText === '') {
      throw this.createAppError(
        ERROR_TYPES.VALIDATION,
        'API returned empty transcript text'
      );
    }

    const MAX_TRANSCRIPT_LENGTH = 10 * 1024 * 1024;
    if (trimmedText.length > MAX_TRANSCRIPT_LENGTH) {
      throw this.createAppError(
        ERROR_TYPES.VALIDATION,
        `Transcript exceeds maximum size: ${trimmedText.length} bytes`
      );
    }

    return trimmedText;
  }

  /**
   * Transform axios error into application error
   * @private
   * @param {Error} error - Axios error object
   * @returns {Error} Transformed application error
   */
  transformError(error) {
    if (!this.hasValidHttpResponse(error)) {
      return this.handleNetworkError(error);
    }

    const status = error.response.status;
    const errorData = error.response.data || null;
    const headers = error.response.headers || {};

    return this.createHttpError(status, errorData, headers);
  }

  /**
   * Check if error has valid HTTP response
   * @private
   * @param {Error} error - Error to check
   * @returns {boolean} True if has valid response
   */
  hasValidHttpResponse(error) {
    return error.response && typeof error.response.status === 'number';
  }

  /**
   * Create HTTP error based on status code
   * @private
   * @param {number} status - HTTP status code
   * @param {*} errorData - Response data
   * @param {Object} headers - Response headers
   * @returns {Error} Application error
   */
  createHttpError(status, errorData, headers) {
    const errorMap = {
      400: {
        type: ERROR_TYPES.INVALID_REQUEST,
        message: 'Invalid YouTube URL or video unavailable',
        context: { status, data: errorData }
      },
      401: {
        type: ERROR_TYPES.UNAUTHORIZED,
        message: 'API authentication failed - check SCRAPE_CREATORS_API_KEY',
        context: { status }
      },
      429: {
        type: ERROR_TYPES.RATE_LIMITED,
        message: 'API rate limit exceeded',
        context: {
          status,
          retryAfter: headers['retry-after']
        }
      }
    };

    const serverErrorStatuses = [500, 502, 503];
    if (serverErrorStatuses.includes(status)) {
      return this.createServerError(status, errorData);
    }

    const errorConfig = errorMap[status];
    if (errorConfig) {
      return this.createAppError(errorConfig.type, errorConfig.message, errorConfig.context);
    }

    return this.createUnknownHttpError(status, errorData);
  }

  /**
   * Create server error (5xx)
   * @private
   * @param {number} status - HTTP status code
   * @param {*} errorData - Response data
   * @returns {Error} Application error
   */
  createServerError(status, errorData) {
    return this.createAppError(
      ERROR_TYPES.SERVER_ERROR,
      'API server error - will skip and continue',
      { status, data: errorData }
    );
  }

  /**
   * Create unknown HTTP error
   * @private
   * @param {number} status - HTTP status code
   * @param {*} errorData - Response data
   * @returns {Error} Application error
   */
  createUnknownHttpError(status, errorData) {
    return this.createAppError(
      ERROR_TYPES.UNKNOWN_HTTP_ERROR,
      `Unexpected HTTP status: ${status}`,
      { status, data: errorData }
    );
  }

  /**
   * Handle network-level errors (no HTTP response)
   * @private
   * @param {Error} error - Axios error object
   * @returns {Error} Application error
   */
  handleNetworkError(error) {
    if (!error) {
      return this.createAppError(
        ERROR_TYPES.NETWORK,
        'Unknown network error (null error object)'
      );
    }

    if (this.isTimeoutError(error)) {
      return this.createAppError(
        ERROR_TYPES.TIMEOUT,
        'Request timeout after 30 seconds',
        { code: error.code }
      );
    }

    if (this.isNetworkError(error)) {
      return this.createAppError(
        ERROR_TYPES.NETWORK,
        `Network error: ${error.message || 'Unknown'}`,
        { code: error.code }
      );
    }

    return this.createAppError(
      ERROR_TYPES.NETWORK,
      `Connection error: ${error.message || 'Unknown'}`,
      { code: error.code, errno: error.errno }
    );
  }

  /**
   * Check if error is timeout-related
   * @private
   * @param {Error} error - Error to check
   * @returns {boolean} True if timeout error
   */
  isTimeoutError(error) {
    return error && error.code && TIMEOUT_ERROR_CODES.includes(error.code);
  }

  /**
   * Check if error is network-related
   * @private
   * @param {Error} error - Error to check
   * @returns {boolean} True if network error
   */
  isNetworkError(error) {
    return error && error.code && NETWORK_ERROR_CODES.includes(error.code);
  }

  /**
   * Create structured application error
   * @private
   * @param {string} type - Error type constant
   * @param {string} message - Error message
   * @param {Object} context - Additional context (sanitized)
   * @returns {Error} Application error
   */
  createAppError(type, message, context = {}) {
    return ErrorHandler.createApplicationError(type, message, context);
  }

  /**
   * Check if error should be retried
   * @param {Error} error - Application error
   * @returns {boolean} True if retriable
   */
  isRetriableError(error) {
    return ErrorHandler.isRetriableError(error);
  }

  /**
   * Check if error should skip and continue
   * @param {Error} error - Application error
   * @returns {boolean} True if should skip
   */
  isSkippableError(error) {
    return ErrorHandler.isSkippableError(error);
  }

  /**
   * Get sanitized client configuration for debugging
   * @returns {Object} Sanitized configuration
   */
  getSanitizedConfig() {
    if (!this.httpClient) {
      return { initialized: false };
    }

    try {
      const config = JSON.parse(JSON.stringify(this.httpClient.defaults));

      if (config.headers && config.headers[API_CLIENT_CONFIG.API_KEY_HEADER]) {
        config.headers[API_CLIENT_CONFIG.API_KEY_HEADER] = '[REDACTED]';
      }

      return config;
    } catch {
      return {
        initialized: true,
        note: 'Config contains non-serializable values'
      };
    }
  }
}

module.exports = APIClient;
