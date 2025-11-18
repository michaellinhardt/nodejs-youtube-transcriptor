/**
 * Data Statistics Command Handler
 * Implements FR-5.1, FR-8.3, TR-3: Show repository statistics
 */

const StorageService = require('../services/StorageService');
const pathResolver = require('../utils/pathResolver');
const { calculateStatistics, formatSize } = require('../utils/StatisticsCalculator');

/**
 * Execute data command
 * Displays total, size, oldest, newest transcript statistics
 *
 * @returns {Promise<void>}
 */
async function dataCommand() {
  let storage;
  let registry;

  try {
    // Initialize storage service
    storage = new StorageService(pathResolver);
    await storage.initialize();

    // Load registry (may be empty for new installations)
    registry = await storage.loadRegistry();
  } catch (error) {
    handleInitializationError(error);
    return;
  }

  // Calculate statistics
  let stats;
  try {
    const storagePath = pathResolver.getStoragePath();

    // Guard: Validate storage path from resolver (SECURITY)
    if (!storagePath || typeof storagePath !== 'string') {
      throw new Error('Path resolver returned invalid storage path');
    }

    stats = await calculateStatistics(registry, storagePath);

    // Guard: Validate statistics result (BUG FIX)
    if (!stats || typeof stats !== 'object') {
      throw new Error('Statistics calculation returned invalid result');
    }
  } catch (error) {
    console.error('Failed to calculate statistics:', error.message);
    if (process.env.NODE_ENV !== 'production') {
      console.error('Stack trace:', error.stack);
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
    console.error('Error: Registry file is corrupted');
    console.error('Run cleanup or manually delete ~/.transcriptor/data.json');
  } else if (error.message.includes('Permission denied')) {
    console.error('Error: Cannot access storage directory');
    console.error('Check permissions for ~/.transcriptor');
  } else {
    console.error('Initialization failed:', error.message);
  }
  process.exit(1);
}

/**
 * Display statistics in human-readable format
 * Implements TR-3 output specification
 * Consistent with process.js output style
 * @param {Object} stats - Statistics object from calculateStatistics
 */
function displayStatistics(stats) {
  // Guard: Validate stats object structure (BUG FIX)
  if (!stats || typeof stats !== 'object') {
    console.error('Invalid statistics object provided to display');
    return;
  }

  // Align output format with process.js command style
  console.log('\n=== Transcriptor Repository Statistics ===\n');

  // Use safe defaults if fields missing (BUG FIX)
  const total = typeof stats.total === 'number' ? stats.total : 0;
  const size = typeof stats.size === 'number' ? stats.size : 0;
  const oldest = stats.oldest || null;
  const newest = stats.newest || null;

  console.log(`Total transcripts: ${total}`);
  console.log(`Storage size:      ${formatSize(size)}`);

  // Guard: Explicit null checks for dates (BUG FIX)
  if (oldest !== null && newest !== null) {
    console.log(`Oldest:            ${oldest}`);
    console.log(`Newest:            ${newest}`);
  } else if (total === 0) {
    console.log('Oldest:            N/A (no transcripts)');
    console.log('Newest:            N/A (no transcripts)');
  } else {
    // Edge case: transcripts exist but no valid dates
    console.log('Oldest:            N/A (date unavailable)');
    console.log('Newest:            N/A (date unavailable)');
  }

  console.log(''); // Trailing blank line for readability
}

module.exports = dataCommand;
