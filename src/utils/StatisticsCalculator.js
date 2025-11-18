/**
 * Statistics Calculator Utility
 * Implements TR-15: Statistics calculation requirements
 * Pure functions with no side effects
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * Calculate all repository statistics
 * @param {Object} registry - Registry data from data.json
 * @param {string} storagePath - Path to ~/.transcriptor
 * @returns {Promise<Object>} Statistics object
 * @throws {Error} If storagePath invalid or filesystem access fails critically
 */
async function calculateStatistics(registry, storagePath) {
  // Guard: Validate storage path before filesystem operations (SECURITY)
  if (!storagePath || typeof storagePath !== 'string' || !path.isAbsolute(storagePath)) {
    throw new Error('Invalid storage path: must be absolute path string');
  }

  // Guard: Handle null/undefined registry (BUG FIX)
  if (!registry || typeof registry !== 'object') {
    return getZeroStatistics();
  }

  // Guard: Handle empty registry
  if (Object.keys(registry).length === 0) {
    return getZeroStatistics();
  }

  const total = getTotalCount(registry);
  const { oldest, newest } = getDateRange(registry);
  const size = await getFolderSize(storagePath);

  return {
    total,
    size,
    oldest,
    newest
  };
}

/**
 * Get zero state for empty repository
 */
function getZeroStatistics() {
  return {
    total: 0,
    size: 0,
    oldest: null,
    newest: null
  };
}

/**
 * Count total transcripts in registry
 */
function getTotalCount(registry) {
  return Object.keys(registry).length;
}

/**
 * Extract oldest and newest dates from registry
 * Implements TR-15 min/max date_added logic
 * @param {Object} registry - Registry object with video entries
 * @returns {Object} Object with oldest and newest date strings (or null)
 */
function getDateRange(registry) {
  // Guard: Handle null/undefined registry (BUG FIX)
  if (!registry || typeof registry !== 'object') {
    return { oldest: null, newest: null };
  }

  const dates = Object.values(registry)
    .filter(entry => entry && typeof entry === 'object') // Filter null entries (BUG FIX)
    .map(entry => entry.date_added)
    .filter(date => date && typeof date === 'string' && date.trim() !== '') // Reject empty strings (BUG FIX)
    .sort(); // Lexicographic sort works for YYYY-MM-DD

  return {
    oldest: dates.length > 0 ? dates[0] : null,
    newest: dates.length > 0 ? dates[dates.length - 1] : null
  };
}

/**
 * Calculate total folder size recursively
 * Handles errors gracefully (skip inaccessible files)
 * @param {string} folderPath - Absolute path to folder
 * @returns {Promise<number>} Total size in bytes
 */
async function getFolderSize(folderPath) {
  // Guard: Validate input path (SECURITY)
  if (!folderPath || typeof folderPath !== 'string') {
    console.warn('Invalid folder path provided to getFolderSize');
    return 0;
  }

  // Guard: Folder doesn't exist
  const exists = await fs.pathExists(folderPath);
  if (!exists) return 0;

  let totalSize = 0;

  try {
    const items = await fs.readdir(folderPath, { withFileTypes: true });

    for (const item of items) {
      // Guard: Skip null/undefined items (BUG FIX)
      if (!item || !item.name) continue;

      const itemPath = path.join(folderPath, item.name);

      try {
        if (item.isDirectory()) {
          totalSize += await getFolderSize(itemPath); // Recursive
        } else if (item.isFile()) {
          const stats = await fs.stat(itemPath);
          // Guard: Validate stats object (BUG FIX)
          if (stats && typeof stats.size === 'number') {
            totalSize += stats.size;
          }
        }
        // Skip symlinks, devices, etc. (explicit design decision)
      } catch (itemError) {
        // Skip inaccessible items (permission denied, etc.)
        // Sanitize path in production to avoid info leakage (SECURITY)
        const displayPath = process.env.NODE_ENV === 'production'
          ? path.basename(itemPath)
          : itemPath;
        console.warn(`Skipping inaccessible item: ${displayPath}`);
      }
    }
  } catch (error) {
    // Sanitize path in production (SECURITY)
    const displayPath = process.env.NODE_ENV === 'production'
      ? 'storage directory'
      : folderPath;
    console.warn(`Cannot read directory ${displayPath}: ${error.message}`);
  }

  return totalSize;
}

/**
 * Format bytes to human-readable size
 * Implements TR-15 humanReadable formatting
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string (e.g., "1.50 MB")
 */
function formatSize(bytes) {
  // Guard: Handle invalid input (BUG FIX)
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) {
    return '0 B';
  }

  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;

  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;

  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

module.exports = {
  calculateStatistics,
  formatSize
};
