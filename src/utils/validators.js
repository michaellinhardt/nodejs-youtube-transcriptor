/**
 * Input Validation Utilities
 *
 * Provides validation functions for user inputs implementing TR-5
 * Prevents invalid data from entering system
 */

/**
 * Validate YouTube video ID format
 * Per TR-5: 11 characters, alphanumeric + dash + underscore
 *
 * @param {string} id - Video ID to validate
 * @returns {boolean} True if valid format, false otherwise
 */
function isValidVideoId(id) {
  if (typeof id !== 'string') {
    return false;
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}

/**
 * Validate date string format and calendar validity
 * UPDATED for Task 11.0: Supports both YYMMDDTHHMM (new) and YYYY-MM-DD (legacy)
 * Per BR-4: YYYY-MM-DD format with valid calendar date
 * Rejects invalid dates like 2024-02-31 (Feb 31st doesn't exist)
 * CRITICAL: Must support both formats during migration period
 *
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid format and calendar date, false otherwise
 */
function isValidDate(dateString) {
  if (typeof dateString !== 'string') {
    return false;
  }

  // BUG FIX: Check length first to prevent unnecessary regex execution
  if (dateString.length !== 10 && dateString.length !== 11) {
    return false;
  }

  // NEW: Accept YYMMDDTHHMM format (length 11)
  if (dateString.length === 11) {
    const timestampMatch = /^(\d{2})(\d{2})(\d{2})T(\d{2})(\d{2})$/.exec(dateString);
    if (timestampMatch) {
      // Delegate to dateUtils for timestamp validation
      const dateUtils = require('./dateUtils');
      return dateUtils.isValidTimestamp(dateString);
    }
    return false; // Length 11 but doesn't match timestamp pattern
  }

  // OLD: Accept YYYY-MM-DD for backward compatibility during migration (length 10)
  const legacyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (legacyMatch) {
    // Extract and validate components
    const year = parseInt(legacyMatch[1], 10);
    const month = parseInt(legacyMatch[2], 10);
    const day = parseInt(legacyMatch[3], 10);

    // Validate ranges
    if (year < 2000 || year > 2099) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    // Validate actual calendar date
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return false;

    return date.getMonth() === month - 1 && date.getDate() === day;
  }

  return false;
}

/**
 * Sanitize video ID removing unsafe characters
 * Used before file operations to prevent path traversal
 *
 * @param {string} id - Video ID to sanitize
 * @returns {string} Sanitized ID
 */
function sanitizeVideoId(id) {
  // Remove any path traversal attempts and keep only safe characters
  return String(id).replace(/[^A-Za-z0-9_-]/g, '');
}

/**
 * Assert video ID is valid, throwing if not
 * Use in critical paths where invalid IDs should halt execution
 *
 * @param {string} id - Video ID to validate
 * @throws {Error} If ID format invalid
 * @returns {void}
 *
 * @example
 * assertValidVideoId(id); // Throws if invalid
 * processVideo(id);       // Safe to proceed
 */
function assertValidVideoId(id) {
  if (!isValidVideoId(id)) {
    throw new Error(
      `Invalid video ID format: "${id}". ` +
        'Expected 11 alphanumeric characters, dashes, or underscores.'
    );
  }
}

/**
 * Assert date string is valid, throwing if not
 * Use in critical paths where invalid dates should halt execution
 * UPDATED for Task 11.0: Enhanced error message for both formats
 *
 * @param {string} dateString - Date string to validate
 * @param {string} context - Optional context for error message
 * @throws {Error} If date format invalid or calendar date impossible
 * @returns {void}
 *
 * @example
 * assertValidDate(dateString); // Throws if invalid
 * cleanOldData(dateString);    // Safe to proceed
 */
function assertValidDate(dateString, context = 'date') {
  if (!isValidDate(dateString)) {
    throw new Error(
      `Invalid ${context} format: "${dateString}". ` +
        'Expected YYMMDDTHHMM (e.g., "251122T1430") or YYYY-MM-DD (legacy)'
    );
  }
}

module.exports = {
  isValidVideoId,
  isValidDate,
  sanitizeVideoId,
  assertValidVideoId,
  assertValidDate,
};
