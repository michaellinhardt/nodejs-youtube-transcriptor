/**
 * Data Statistics Command Handler
 * Implements FR-5.1, FR-8.3, TR-3: Show repository statistics
 */

const StorageService = require('../services/StorageService');
const pathResolver = require('../utils/pathResolver');
const { calculateStatisticsFromMetadata, formatSize } = require('../utils/StatisticsCalculator');
const { logger } = require('../utils/Logger');

/**
 * Execute data command
 * Displays total, size, oldest, newest transcript statistics
 *
 * @returns {Promise<void>}
 */
async function dataCommand() {
  let storage;

  try {
    // Initialize storage service
    storage = new StorageService(pathResolver);
    await storage.initialize();
  } catch (error) {
    handleInitializationError(error);
    return;
  }

  // Calculate statistics (optimized with metadata cache)
  let stats;
  try {
    const storagePath = pathResolver.getStoragePath();

    // Guard: Validate storage path from resolver (SECURITY)
    if (!storagePath || typeof storagePath !== 'string') {
      throw new Error('Path resolver returned invalid storage path');
    }

    // Use optimized metadata-only calculation
    logger.verbose('Using cached metadata for statistics calculation');
    const metadata = await storage.loadRegistryMetadata();
    stats = await calculateStatisticsFromMetadata(metadata, storagePath);

    // Guard: Validate statistics result (BUG FIX)
    if (!stats || typeof stats !== 'object') {
      throw new Error('Statistics calculation returned invalid result');
    }

    // Log cache statistics in verbose mode
    if (logger.isVerbose()) {
      const cacheStats = storage.cache.getStats();
      logger.debug(cacheStats, 'Cache Statistics');
    }
  } catch (error) {
    logger.error('Failed to calculate statistics:', error.message);
    if (process.env.NODE_ENV !== 'production') {
      logger.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }

  // Display results
  displayStatistics(stats);
}

/**
 * Handle initialization errors with context
 */
function handleInitializationError(error) {
  if (error.message.includes('corrupted')) {
    logger.error('Error: Registry file is corrupted');
    logger.error('Run cleanup or manually delete ~/.transcriptor/data.json');
  } else if (error.message.includes('Permission denied')) {
    logger.error('Error: Cannot access storage directory');
    logger.error('Check permissions for ~/.transcriptor');
  } else {
    logger.error('Initialization failed:', error.message);
  }
  process.exit(1);
}

/**
 * Display statistics in human-readable format
 * Implements TR-3 output specification with metadata support
 * Consistent with process.js output style
 * @param {Object} stats - Statistics object from calculateStatistics
 */
async function displayStatistics(stats) {
  // Guard: Validate stats object structure (BUG FIX)
  if (!stats || typeof stats !== 'object') {
    logger.error('Invalid statistics object provided to display');
    return;
  }

  // Align output format with process.js command style
  logger.info('\n=== Transcriptor Repository Statistics ===\n');

  // Use safe defaults if fields missing (BUG FIX)
  const total = typeof stats.total === 'number' ? stats.total : 0;
  const size = typeof stats.size === 'number' ? stats.size : 0;
  const oldest = stats.oldest || null;
  const newest = stats.newest || null;

  logger.info(`Total transcripts: ${total}`);
  logger.info(`Storage size:      ${formatSize(size)}`);

  // Guard: Explicit null checks for dates (BUG FIX)
  if (oldest !== null && newest !== null) {
    logger.info(`Oldest:            ${oldest}`);
    logger.info(`Newest:            ${newest}`);
  } else if (total === 0) {
    logger.info('Oldest:            N/A (no transcripts)');
    logger.info('Newest:            N/A (no transcripts)');
  } else {
    // Edge case: transcripts exist but no valid dates
    logger.info('Oldest:            N/A (date unavailable)');
    logger.info('Newest:            N/A (date unavailable)');
  }

  logger.info(''); // Trailing blank line for readability

  // Display per-entry metadata if available
  if (stats.entries && Array.isArray(stats.entries) && stats.entries.length > 0) {
    logger.info('--- Per Entry Details ---\n');
    for (const entry of stats.entries) {
      logger.info(`Video ID: ${entry.videoId}`);
      logger.info(`  Channel: ${entry.channel || 'N/A'}`);
      logger.info(`  Title: ${entry.title || 'N/A'}`);
      logger.info(`  Date Added: ${entry.date_added || 'N/A'}`);
      logger.info(`  Links: ${entry.links ? entry.links.length : 0}`);
      logger.info('');
    }
  }
}

module.exports = dataCommand;
