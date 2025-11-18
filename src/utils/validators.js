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
  if (typeof id !== 'string') return false;
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}

/**
 * Validate date string format and calendar validity
 * Per BR-4: YYYY-MM-DD format with valid calendar date
 * Rejects invalid dates like 2024-02-31 (Feb 31st doesn't exist)
 *
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid format and calendar date, false otherwise
 */
function isValidDate(dateString) {
  if (typeof dateString !== 'string') return false;

  // Check format and extract components
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return false;

  // Parse components
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // Validate ranges
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Create date and verify no coercion occurred
  // month is 0-indexed in Date constructor
  const date = new Date(year, month - 1, day);

  // If JavaScript coerced the date, components won't match
  if (date.getFullYear() !== year) return false;
  if (date.getMonth() !== month - 1) return false;
  if (date.getDate() !== day) return false;

  return !isNaN(date.getTime());
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
 *
 * @param {string} dateString - Date string to validate
 * @throws {Error} If date format invalid or calendar date impossible
 * @returns {void}
 *
 * @example
 * assertValidDate(dateString); // Throws if invalid
 * cleanOldData(dateString);    // Safe to proceed
 */
function assertValidDate(dateString) {
  if (!isValidDate(dateString)) {
    throw new Error(
      `Invalid date format: "${dateString}". ` +
      'Expected YYYY-MM-DD with valid calendar date.'
    );
  }
}

module.exports = {
  isValidVideoId,
  isValidDate,
  sanitizeVideoId,
  assertValidVideoId,
  assertValidDate
};
