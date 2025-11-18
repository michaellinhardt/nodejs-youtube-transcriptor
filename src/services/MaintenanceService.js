/**
 * Maintenance Service
 *
 * Manages automated integrity validation for transcript storage
 * Implements FR-7, TR-14
 *
 * @class MaintenanceService
 */
class MaintenanceService {
  /**
   * @param {StorageService} storageService - Storage layer dependency
   * @param {LinkManager} linkManager - Link management dependency
   */
  constructor(storageService, linkManager) {
    // SECURITY: Validate dependencies with explicit null checks
    if (!storageService || typeof storageService !== 'object') {
      throw new Error('MaintenanceService requires valid StorageService dependency');
    }
    if (!linkManager || typeof linkManager !== 'object') {
      throw new Error('MaintenanceService requires valid LinkManager dependency');
    }

    // SECURITY: Verify required methods exist (fail-fast validation)
    if (typeof storageService.loadRegistry !== 'function') {
      throw new Error('StorageService missing required loadRegistry method');
    }
    if (typeof storageService.transcriptExists !== 'function') {
      throw new Error('StorageService missing required transcriptExists method');
    }
    if (typeof storageService.saveRegistry !== 'function') {
      throw new Error('StorageService missing required saveRegistry method');
    }
    if (typeof linkManager.removeAllLinks !== 'function') {
      throw new Error('LinkManager missing required removeAllLinks method');
    }

    this.storage = storageService;
    this.linkManager = linkManager;
  }

  /**
   * Validate registry integrity (implements FR-7.1, TR-14)
   * Checks all registry entries have corresponding transcript files
   * Removes orphaned entries and their links
   *
   * SECURITY: Fail-safe operation - errors on individual entries don't stop validation
   * PERFORMANCE: Single registry save after all changes (atomic batch update)
   *
   * @returns {Promise<Object>} Validation results with counts
   *   - checked: number of entries validated
   *   - orphaned: number of entries removed
   *   - linksRemoved: total symbolic links deleted
   *   - linksFailed: total link deletion failures
   *   - errors: array of error details [{videoId, error}]
   *   - message: optional status message for special cases
   */
  async validateIntegrity() {
    // SECURITY: Initialize statistics with Object.create(null) to prevent prototype pollution
    const stats = Object.create(null);
    stats.checked = 0;
    stats.orphaned = 0;
    stats.linksRemoved = 0;
    stats.linksFailed = 0;
    stats.errors = [];

    // 1. Load registry
    const registry = await this.storage.loadRegistry();
    const entries = Object.entries(registry);

    // OPTIMIZATION: Early return for empty registry
    if (entries.length === 0) {
      stats.message = 'Registry empty, nothing to validate';
      return stats;
    }

    console.log(`[Maintenance] Validating ${entries.length} registry entries...`);

    // 2. Collect orphaned entries (fail-safe iteration)
    const orphans = [];

    for (const [videoId, entry] of entries) {
      stats.checked++;

      // SECURITY: Validate entry structure before processing
      if (!entry || typeof entry !== 'object') {
        stats.errors.push({
          videoId,
          error: 'Invalid entry structure (not an object)',
        });
        console.warn(`[Maintenance] Skipping invalid entry: ${videoId}`);
        continue;
      }

      try {
        const exists = await this.storage.transcriptExists(videoId);

        if (!exists) {
          orphans.push({ videoId, entry });
        }
      } catch (error) {
        // FAIL-SAFE: Log and continue on individual validation errors
        stats.errors.push({
          videoId,
          error: error.message || 'Unknown validation error',
        });
        console.warn(`[Maintenance] Error checking ${videoId}: ${error.message}`);
      }
    }

    // OPTIMIZATION: Early return if no cleanup needed
    if (orphans.length === 0) {
      console.log('[Maintenance] All entries valid, no cleanup needed');
      return stats;
    }

    console.log(`[Maintenance] Found ${orphans.length} orphaned entries`);

    // 3. Cleanup orphans (fail-safe batch processing)
    for (const { videoId, entry } of orphans) {
      try {
        const cleanupStats = await this._removeOrphanedEntry(videoId, entry, registry);
        stats.orphaned++;

        // BUG PREVENTION: Aggregate link cleanup statistics with null safety
        if (cleanupStats && typeof cleanupStats === 'object') {
          stats.linksRemoved += cleanupStats.linksRemoved || 0;
          stats.linksFailed += cleanupStats.linksFailed || 0;
        }
      } catch (error) {
        stats.errors.push({
          videoId,
          error: error.message || 'Unknown cleanup error',
        });
        console.error(`[Maintenance] Failed to remove ${videoId}: ${error.message}`);
      }
    }

    // 4. Atomic registry save (implements TR-8 atomic write)
    if (stats.orphaned > 0) {
      try {
        await this.storage.saveRegistry(registry);
        console.log(`[Maintenance] Registry updated, removed ${stats.orphaned} orphaned entries`);
      } catch (error) {
        // CRITICAL: Cleanup succeeded but persistence failed
        throw new Error(
          `Registry cleanup succeeded (${stats.orphaned} entries) but save failed: ${error.message}. ` +
            'Manual registry repair may be required.'
        );
      }
    }

    return stats;
  }

  /**
   * Remove orphaned registry entry and all its links
   *
   * BUG PREVENTION: Modifies registry in-place but doesn't save (caller responsibility)
   * SEPARATION OF CONCERNS: Uses LinkManager for link operations, modifies registry directly
   *
   * @param {string} videoId - Orphaned video ID
   * @param {Object} entry - Registry entry data
   * @param {Object} registry - Registry object (mutated in-place)
   * @returns {Promise<Object>} Cleanup statistics {linksRemoved, linksFailed}
   * @private
   */
  async _removeOrphanedEntry(videoId, entry, registry) {
    console.log(
      `[Maintenance] Removing orphaned entry: ${videoId} (added ${entry.date_added || 'unknown'})`
    );

    const cleanupStats = {
      linksRemoved: 0,
      linksFailed: 0,
    };

    // 1. Remove all symbolic links via LinkManager
    try {
      const linkResults = await this.linkManager.removeAllLinks(videoId);

      // BUG PREVENTION: Validate linkResults structure before accessing
      if (!linkResults || typeof linkResults !== 'object') {
        console.warn(`[Maintenance] Invalid link cleanup results for ${videoId}`);
      } else {
        cleanupStats.linksRemoved = linkResults.removed || 0;

        // Calculate failed count from errors array
        if (Array.isArray(linkResults.errors)) {
          cleanupStats.linksFailed = linkResults.errors.length;
        }

        // Log results with null safety
        if (linkResults.removed > 0) {
          console.log(`[Maintenance]   Removed ${linkResults.removed} symbolic link(s)`);
        }
        if (linkResults.skipped > 0) {
          console.log(`[Maintenance]   Skipped ${linkResults.skipped} missing link(s)`);
        }
        if (Array.isArray(linkResults.errors) && linkResults.errors.length > 0) {
          console.warn(`[Maintenance]   Failed to remove ${linkResults.errors.length} link(s)`);
          linkResults.errors.forEach((err) => {
            console.warn(`[Maintenance]     ${err.path}: ${err.error}`);
          });
        }
      }
    } catch (linkError) {
      // FAIL-SAFE: Continue with registry cleanup even if link cleanup fails
      console.error(`[Maintenance] Link cleanup failed for ${videoId}: ${linkError.message}`);
      console.error(`[Maintenance] Continuing with registry entry removal`);
    }

    // 2. Delete registry entry (in-place mutation)
    delete registry[videoId];

    console.log(`[Maintenance]   Orphaned entry removed`);

    return cleanupStats;
  }
}

module.exports = MaintenanceService;
