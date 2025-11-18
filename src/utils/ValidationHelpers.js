/**
 * ValidationHelpers - Common validation utilities
 *
 * Provides reusable validation functions to eliminate duplicate
 * validation logic across the codebase. Follows DRY principle.
 */
class ValidationHelpers {
  /**
   * Check if value is a non-empty string
   * @param {*} value - Value to check
   * @returns {boolean} True if value is non-empty string
   */
  static isNonEmptyString(value) {
    return value && typeof value === 'string' && value.trim() !== '';
  }

  /**
   * Validate required string field with descriptive error
   * @param {*} value - Value to validate
   * @param {string} fieldName - Field name for error message
   * @returns {string} Trimmed value
   * @throws {Error} If validation fails
   */
  static validateRequiredString(value, fieldName) {
    if (!value || typeof value !== 'string') {
      throw new Error(`${fieldName} missing or invalid type`);
    }

    const trimmedValue = value.trim();

    if (trimmedValue === '') {
      throw new Error(`${fieldName} is empty string`);
    }

    return trimmedValue;
  }

  /**
   * Sanitize string with optional max length
   * @param {*} value - Value to sanitize
   * @param {number} [maxLength] - Maximum length (optional)
   * @returns {string|null} Sanitized string or null if invalid
   */
  static sanitizeString(value, maxLength = null) {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();

    if (trimmed === '') {
      return null;
    }

    if (maxLength && trimmed.length > maxLength) {
      return trimmed.slice(0, maxLength);
    }

    return trimmed;
  }
}

module.exports = ValidationHelpers;
