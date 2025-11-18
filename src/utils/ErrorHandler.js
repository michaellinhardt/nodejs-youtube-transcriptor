/**
 * ErrorHandler - Error creation and management utilities
 *
 * Centralized error handling logic extracted from APIClient.
 * Handles error creation, sanitization, and classification.
 */
const { ERROR_TYPES } = require('../constants/APIClientConstants');

class ErrorHandler {
  /**
   * Create structured application error
   * @param {string} type - Error type from ERROR_TYPES
   * @param {string} message - Human-readable error message
   * @param {Object} [context={}] - Additional error context
   * @returns {Error} Structured error with type and sanitized context
   */
  static createApplicationError(type, message, context = {}) {
    const error = new Error(message);
    error.type = type;
    error.context = this.sanitizeContext(context);
    error.isAPIError = true;
    return error;
  }

  /**
   * Sanitize error context to prevent credential leakage
   * @param {Object} context - Raw error context
   * @returns {Object} Sanitized context safe for logging
   */
  static sanitizeContext(context) {
    const sanitized = { ...context };

    if (sanitized.headers) {
      delete sanitized.headers['x-api-key'];
      delete sanitized.headers['authorization'];
    }

    if (sanitized.data) {
      sanitized.data = this.truncateData(sanitized.data, 500);
    }

    return sanitized;
  }

  /**
   * Truncate data for safe logging
   * @param {*} data - Data to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated string representation
   */
  static truncateData(data, maxLength) {
    if (typeof data === 'string') {
      return data.substring(0, maxLength);
    }

    try {
      const serialized = JSON.stringify(data);
      return serialized.substring(0, maxLength);
    } catch {
      return '[Non-serializable data]';
    }
  }

  /**
   * Check if error should be retried
   * @param {Error} error - Error to check
   * @returns {boolean} True if error is retriable
   */
  static isRetriableError(error) {
    return error.type === ERROR_TYPES.RATE_LIMITED;
  }

  /**
   * Check if error should skip and continue processing
   * @param {Error} error - Error to check
   * @returns {boolean} True if error is skippable
   */
  static isSkippableError(error) {
    return [
      ERROR_TYPES.INVALID_REQUEST,
      ERROR_TYPES.SERVER_ERROR,
      ERROR_TYPES.TIMEOUT,
      ERROR_TYPES.NETWORK,
      ERROR_TYPES.VALIDATION
    ].includes(error.type);
  }
}

module.exports = ErrorHandler;
