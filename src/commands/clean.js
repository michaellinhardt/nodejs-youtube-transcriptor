const StorageService = require('../services/StorageService');
const LinkManager = require('../services/LinkManager');
const pathResolver = require('../utils/pathResolver');
const validators = require('../utils/validators');

/**
 * Validate registry entry structure for filtering
 * Ensures entry meets schema requirements before processing
 *
 * @param {string} videoId - Video ID
 * @param {*} entry - Registry entry to validate
 * @returns {Object} { valid: boolean, reason?: string }
 * @private
 */
function validateRegistryEntry(videoId, entry) {
  // Guard: Entry exists and is object
  if (!entry || typeof entry !== 'object') {
    return { valid: false, reason: 'Entry is null or not an object' };
  }

  // Guard: date_added field exists and is non-empty string
  if (!entry.date_added || typeof entry.date_added !== 'string' || entry.date_added.trim() === '') {
    return { valid: false, reason: 'Missing or invalid date_added field' };
  }

  // Guard: date_added format valid (YYYY-MM-DD per BR-4)
  if (!validators.isValidDate(entry.date_added)) {
    return { valid: false, reason: `Invalid date format: ${entry.date_added}` };
  }

  // Guard: links field exists and is array
  if (!Array.isArray(entry.links)) {
    return { valid: false, reason: 'Missing or invalid links field' };
  }

  return { valid: true };
}

/**
 * Clean Command Handler
 * Implements FR-6, FR-8.4: Remove old transcripts
 *
 * @param {string} dateString - Date boundary in YYYY-MM-DD format
 * @returns {Promise<void>}
 */
async function cleanCommand(dateString) {
  // Guard: Validate date argument provided
  if (!dateString) {
    console.error('Error: Date argument required');
    console.error('Usage: transcriptor clean YYYY-MM-DD');
    console.error('Example: transcriptor clean 2025-11-01');
    process.exit(2); // Exit code 2: Validation failure
  }

  // Wrap entire command in try-catch for unexpected errors
  try {
    // Step 1: Validate date format
    try {
      validators.assertValidDate(dateString);
    } catch (error) {
      console.error('Invalid date format:', error.message);
      console.error('Usage: transcriptor clean YYYY-MM-DD');
      console.error('Example: transcriptor clean 2025-11-01');
      process.exit(2); // Exit code 2: Validation failure
    }

    // Parse into Date object for future date warning
    const boundaryDate = new Date(dateString);

    // Optional: Warn if future date provided
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (boundaryDate > today) {
      console.warn('Warning: Boundary date is in the future');
      console.warn('This will not delete any transcripts');
    }

    // Step 2: Load registry and filter
    const storage = new StorageService(pathResolver);
    await storage.initialize();

    let registry;
    try {
      registry = await storage.loadRegistry();
    } catch (error) {
      console.error('Failed to load registry:', error.message);
      if (error.message.includes('corrupted')) {
        console.error('Registry file is corrupted. Manual cleanup may be required.');
      }
      process.exit(1);
    }

    // Guard: Handle empty registry
    if (Object.keys(registry).length === 0) {
      console.log('No transcripts found in registry. Nothing to clean.');
      return;
    }

    // Filter transcripts by date (exclusive boundary)
    const deletionCandidates = [];
    let skippedCount = 0;
    let corruptedCount = 0;

    for (const [videoId, entry] of Object.entries(registry)) {
      // Guard: Validate entry structure completely
      const validationResult = validateRegistryEntry(videoId, entry);
      if (!validationResult.valid) {
        console.warn(`Skipping corrupted entry: ${videoId} - ${validationResult.reason}`);
        corruptedCount++;
        continue;
      }

      // Compare dates as strings (YYYY-MM-DD lexicographic comparison works)
      if (entry.date_added < dateString) {
        deletionCandidates.push({ videoId, entry });
      } else {
        skippedCount++;
      }
    }

    // Guard: Nothing to delete
    if (deletionCandidates.length === 0) {
      console.log(`No transcripts older than ${dateString}. Nothing to clean.`);
      console.log(`Total transcripts: ${Object.keys(registry).length}`);
      if (corruptedCount > 0) {
        console.warn(
          `Warning: ${corruptedCount} corrupted entries skipped (run data command for details)`
        );
      }
      return;
    }

    console.log(`\nFound ${deletionCandidates.length} transcripts older than ${dateString}`);
    console.log(`Keeping ${skippedCount} transcripts (boundary date or newer)`);
    if (corruptedCount > 0) {
      console.warn(`Skipped ${corruptedCount} corrupted entries`);
    }
    console.log('');

    // Step 3: Delete transcripts atomically
    const linkManager = new LinkManager(storage, pathResolver);

    const results = {
      total: deletionCandidates.length,
      success: 0,
      errors: [],
      linksRemoved: 0,
      linksSkipped: 0,
    };

    // Process each transcript atomically with progress reporting
    let processedCount = 0;
    for (const { videoId, entry } of deletionCandidates) {
      processedCount++;
      const progress = `[${processedCount}/${results.total}]`;

      try {
        console.log(`${progress} Deleting: ${videoId} (added ${entry.date_added})`);

        // 1. Delete all symbolic links
        const linkResults = await linkManager.removeAllLinks(videoId);
        results.linksRemoved += linkResults.removed;
        results.linksSkipped += linkResults.skipped;

        if (linkResults.errors && linkResults.errors.length > 0) {
          console.warn(`  Warning: Some links could not be removed for ${videoId}`);
          linkResults.errors.forEach((err) => {
            console.warn(`    ${err.path}: ${err.error}`);
          });
        }

        // 2. Delete transcript file
        try {
          await storage.deleteTranscript(videoId);
        } catch (deleteError) {
          // Handle ENOENT gracefully (file already deleted)
          if (deleteError.message.includes('Transcript not found')) {
            console.warn(`  Warning: Transcript file already deleted: ${videoId}`);
          } else {
            throw deleteError;
          }
        }

        // 3. Remove registry entry
        delete registry[videoId];

        // 4. Save registry atomically (implements FR-9.1)
        await storage.saveRegistry(registry);

        results.success++;
        console.log(`  ✓ Deleted successfully`);
      } catch (error) {
        // Fail-safe: Log error and continue (FR-10.1)
        console.error(`  ✗ Error deleting ${videoId}: ${error.message}`);
        results.errors.push({
          videoId,
          error: error.message,
          date_added: entry.date_added,
        });
      }
    }

    // Step 4: Display summary
    console.log('\n=== Cleanup Summary ===\n');
    console.log(`Total transcripts processed: ${results.total}`);
    console.log(`Successfully deleted:        ${results.success}`);
    console.log(`Failed to delete:            ${results.errors.length}`);
    console.log(`Symbolic links removed:      ${results.linksRemoved}`);
    console.log(`Symbolic links skipped:      ${results.linksSkipped}`);

    // Show errors if any
    if (results.errors.length > 0) {
      console.log('\nErrors encountered:');
      results.errors.forEach((err) => {
        console.log(`  ${err.videoId} (${err.date_added}): ${err.error}`);
      });
      console.log('\nTranscripts with errors remain in the registry.');
      console.log('Review errors and run clean command again if needed.');
    }

    // Final status
    console.log('');
    if (results.errors.length === 0) {
      console.log('Cleanup completed successfully.');
    } else {
      console.log('Cleanup completed with errors (see above).');
    }

    // Exit with appropriate status
    // Exit code 0: Full success
    // Exit code 1: Partial success with errors
    // Exit code 2: Validation failure (no operations performed)
    if (results.errors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    // Catch-all for unexpected errors
    console.error('\nUnexpected error during cleanup:', error.message);

    if (process.env.NODE_ENV !== 'production') {
      console.error('Stack trace:', error.stack);
    }

    console.error('\nCleanup may be partially complete.');
    console.error('Review registry state and try again.');

    // Exit code 1 for unexpected errors during execution
    process.exit(1);
  }
}

module.exports = cleanCommand;
