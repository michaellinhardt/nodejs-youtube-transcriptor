/**
 * Date Utilities
 *
 * Provides date and timestamp generation, validation, and conversion utilities
 * Implements TR-31 (timestamp generation), TR-30 (date conversion), TR-32 (prefix extraction)
 * Supports both YYMMDDTHHMM (new) and YYYY-MM-DD (legacy migration) formats
 *
 * @module dateUtils
 */

/**
 * Generate current timestamp in YYMMDDTHHMM format
 * Implements TR-31 specification
 * SECURITY: Validates generated timestamp before return
 *
 * @returns {string} Timestamp in YYMMDDTHHMM format
 * @throws {Error} If system time invalid or timestamp generation fails
 *
 * @example
 * generateDateAdded() // "251122T1430" (2025-11-22 14:30)
 */
function generateDateAdded() {
  const now = new Date();

  // SECURITY: Guard against invalid Date objects
  if (isNaN(now.getTime())) {
    throw new Error('Invalid Date object - system time may be corrupted');
  }

  const yy = String(now.getFullYear()).slice(-2); // Last 2 digits of year
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');

  const timestamp = `${yy}${mm}${dd}T${hh}${min}`;

  // SECURITY: Validate generated timestamp before returning
  if (!isValidTimestamp(timestamp)) {
    throw new Error(`Generated invalid timestamp: ${timestamp}`);
  }

  return timestamp;
}

/**
 * Validate YYMMDDTHHMM format timestamp
 * Implements TR-31 validation
 * BUG FIX: Added year range validation and enhanced edge case handling
 *
 * @param {*} timestamp - Timestamp to validate
 * @returns {boolean} True if valid YYMMDDTHHMM format, false otherwise
 *
 * @example
 * isValidTimestamp('251122T1430') // true
 * isValidTimestamp('251122T2500') // false (invalid hour)
 * isValidTimestamp('2025-11-22') // false (wrong format)
 */
function isValidTimestamp(timestamp) {
  if (typeof timestamp !== 'string') return false;

  // BUG FIX: Explicitly check length before regex to prevent ReDoS
  if (timestamp.length !== 11) return false;

  const match = /^(\d{2})(\d{2})(\d{2})T(\d{2})(\d{2})$/.exec(timestamp);
  if (!match) return false;

  const [_, yy, mm, dd, hh, min] = match;

  // Validate ranges
  const yearNum = parseInt(yy, 10);
  const monthNum = parseInt(mm, 10);
  const dayNum = parseInt(dd, 10);
  const hourNum = parseInt(hh, 10);
  const minNum = parseInt(min, 10);

  // BUG FIX: Validate year range (00-99, assuming 2000-2099)
  if (yearNum < 0 || yearNum > 99) return false;

  if (monthNum < 1 || monthNum > 12) return false;
  if (dayNum < 1 || dayNum > 31) return false;
  if (hourNum > 23) return false;
  if (minNum > 59) return false;

  // Validate actual calendar date
  const fullYear = 2000 + yearNum;
  const date = new Date(fullYear, monthNum - 1, dayNum, hourNum, minNum);

  // BUG FIX: Check Date object is valid before accessing methods
  if (isNaN(date.getTime())) return false;

  return date.getMonth() === monthNum - 1 && date.getDate() === dayNum;
}

/**
 * Convert YYYY-MM-DD to YYMMDD prefix for cleanup matching
 * Implements TR-30 specification
 *
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string} Date prefix in YYMMDD format
 * @throws {Error} If date format invalid
 *
 * @example
 * convertDateToPrefix('2025-11-22') // "251122"
 * convertDateToPrefix('2024-01-01') // "240101"
 */
function convertDateToPrefix(dateString) {
  // Validate input format first
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`Invalid date format: ${dateString}`);
  }

  const year = dateString.substring(2, 4); // YY
  const month = dateString.substring(5, 7); // MM
  const day = dateString.substring(8, 10); // DD

  return `${year}${month}${day}`;
}

/**
 * Extract date prefix from timestamp for comparison
 * Implements TR-32 specification
 *
 * @param {string} timestamp - Timestamp in YYMMDDTHHMM format
 * @returns {string} Date prefix (first 6 characters - YYMMDD)
 *
 * @example
 * extractDatePrefix('251122T1430') // "251122"
 * extractDatePrefix('240101T0000') // "240101"
 */
function extractDatePrefix(timestamp) {
  // Extract YYMMDD from YYMMDDTHHMM
  return timestamp.substring(0, 6);
}

/**
 * Migrate old date format to new timestamp format
 * Used during registry migration
 * Assumes midnight (T0000) for historical entries
 *
 * @param {string} oldDate - Date in YYYY-MM-DD format
 * @returns {string} Timestamp in YYMMDDTHHMM format
 * @throws {Error} If old date format invalid
 *
 * @example
 * migrateDate('2025-11-22') // "251122T0000"
 * migrateDate('2024-01-15') // "240115T0000"
 */
function migrateDate(oldDate) {
  // YYYY-MM-DD -> YYMMDDTHHMM (assume midnight)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(oldDate)) {
    throw new Error(`Cannot migrate invalid date: ${oldDate}`);
  }

  const yy = oldDate.substring(2, 4);
  const mm = oldDate.substring(5, 7);
  const dd = oldDate.substring(8, 10);

  return `${yy}${mm}${dd}T0000`;
}

module.exports = {
  generateDateAdded,
  isValidTimestamp,
  convertDateToPrefix,
  extractDatePrefix,
  migrateDate,
};
