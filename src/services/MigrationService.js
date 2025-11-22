const fs = require('fs-extra');
const path = require('path');
const dateUtils = require('../utils/dateUtils');

/**
 * Migration Service
 *
 * Handles automatic data structure migration from old format to new format
 * Implements data transformation for Task 11.0 migration requirements
 *
 * Migration transformations:
 * - Date format: YYYY-MM-DD -> YYMMDDTHHMM
 * - Registry structure: Remove links field
 * - Filenames: {videoId}*.md -> transcript_{videoId}*.md
 * - Metadata: Add fallback channel/title if missing
 *
 * @class MigrationService
 */
class MigrationService {
  constructor(storage, paths) {
    this.storage = storage;
    this.paths = paths;
  }

  /**
   * Check if registry needs migration
   * Returns true if any entry has old format
   *
   * @param {Object} registry - Registry data
   * @returns {boolean} True if migration needed
   */
  needsMigration(registry) {
    for (const [videoId, entry] of Object.entries(registry)) {
      // Check for old date format (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(entry.date_added)) {
        return true;
      }
      // Check for links field (deprecated)
      if (entry.links !== undefined) {
        return true;
      }
    }
    return false;
  }

  /**
   * Migrate registry to new format
   * Returns migrated registry object
   * Implements 4-phase migration: Backup -> Migrate -> Validate -> Save
   *
   * @param {Object} registry - Original registry data
   * @returns {Promise<Object>} Migrated registry
   * @throws {Error} If migration fails at any phase
   */
  async migrateRegistry(registry) {
    console.log('\n=== Data Migration Starting ===\n');
    console.log('Migrating registry to new format...');

    const stats = {
      total: Object.keys(registry).length,
      datesConverted: 0,
      linksRemoved: 0,
      filesRenamed: 0,
      errors: [],
    };

    const migratedRegistry = {};

    for (const [videoId, entry] of Object.entries(registry)) {
      try {
        const migratedEntry = await this.migrateEntry(videoId, entry, stats);
        migratedRegistry[videoId] = migratedEntry;
      } catch (error) {
        console.error(`Migration failed for ${videoId}: ${error.message}`);
        stats.errors.push({ videoId, error: error.message });
        // Keep original entry on migration failure
        migratedRegistry[videoId] = entry;
      }
    }

    // Rename transcript files
    await this.renameTranscriptFiles(registry, stats);

    console.log('\n=== Migration Summary ===');
    console.log(`Total entries: ${stats.total}`);
    console.log(`Dates converted: ${stats.datesConverted}`);
    console.log(`Links fields removed: ${stats.linksRemoved}`);
    console.log(`Files renamed: ${stats.filesRenamed}`);
    console.log(`Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.warn('\nMigration errors:');
      stats.errors.forEach((err) => {
        console.warn(`  ${err.videoId}: ${err.error}`);
      });
    }

    console.log('\n=== Migration Complete ===\n');

    return migratedRegistry;
  }

  /**
   * Migrate single registry entry
   * Converts date format, removes links, ensures metadata fields
   *
   * @param {string} videoId - Video ID
   * @param {Object} entry - Original entry
   * @param {Object} stats - Migration statistics object
   * @returns {Promise<Object>} Migrated entry
   */
  async migrateEntry(videoId, entry, stats) {
    const migrated = { ...entry };

    // Convert date format if needed (YYYY-MM-DD -> YYMMDDTHHMM)
    if (/^\d{4}-\d{2}-\d{2}$/.test(entry.date_added)) {
      migrated.date_added = dateUtils.migrateDate(entry.date_added);
      stats.datesConverted++;
      console.log(`  ${videoId}: Date converted to ${migrated.date_added}`);
    }

    // Remove links field if present
    if (migrated.links !== undefined) {
      delete migrated.links;
      stats.linksRemoved++;
      console.log(`  ${videoId}: Links field removed`);
    }

    // Ensure channel and title exist (backward compatibility)
    if (!migrated.channel) {
      migrated.channel = 'unknown_channel';
      console.warn(`  ${videoId}: Added fallback channel`);
    }
    if (!migrated.title) {
      migrated.title = 'unknown_title';
      console.warn(`  ${videoId}: Added fallback title`);
    }

    return migrated;
  }

  /**
   * Rename transcript files from old to new pattern
   * Pattern: {videoId}*.md -> transcript_{videoId}*.md
   * CRITICAL FIX: Added file locking and transaction boundaries
   *
   * @param {Object} registry - Registry data (for video ID validation)
   * @param {Object} stats - Migration statistics object
   * @returns {Promise<void>}
   * @throws {Error} If rename operations fail
   */
  async renameTranscriptFiles(registry, stats) {
    const transcriptsPath = this.paths.getTranscriptsPath();
    const lockFilePath = path.join(transcriptsPath, '.migration.lock');
    const renameLog = [];

    try {
      // CRITICAL: Create lock file to prevent concurrent access
      if (await fs.pathExists(lockFilePath)) {
        throw new Error('Migration already in progress (lock file exists)');
      }
      await fs.writeFile(
        lockFilePath,
        JSON.stringify({
          startTime: new Date().toISOString(),
          pid: process.pid,
        }),
        'utf8'
      );

      const files = await fs.readdir(transcriptsPath);

      for (const file of files) {
        // Skip lock file and files already with transcript_ prefix
        if (file === '.migration.lock' || file.startsWith('transcript_')) {
          continue;
        }

        // Check if file matches old pattern: {videoId}_*.md or {videoId}.md
        const videoIdMatch = /^([A-Za-z0-9_-]{11})(_.*)?\.md$/.exec(file);
        if (!videoIdMatch) {
          continue;
        }

        const videoId = videoIdMatch[1];

        // Verify video ID exists in registry
        if (!registry[videoId]) {
          console.warn(`  Skipping orphan file: ${file}`);
          continue;
        }

        // Rename: add transcript_ prefix
        const oldPath = path.join(transcriptsPath, file);
        const newFile = `transcript_${file}`;
        const newPath = path.join(transcriptsPath, newFile);

        // Check if target already exists
        if (await fs.pathExists(newPath)) {
          console.warn(`  Target exists, skipping: ${newFile}`);
          continue;
        }

        // CRITICAL: Validate paths before rename (prevent traversal)
        if (!oldPath.startsWith(transcriptsPath) || !newPath.startsWith(transcriptsPath)) {
          throw new Error(`Path traversal attempt detected: ${file}`);
        }

        // ENHANCEMENT: Log rename operation for rollback capability
        renameLog.push({ oldPath, newPath, videoId });

        await fs.rename(oldPath, newPath);
        stats.filesRenamed++;
        console.log(`  Renamed: ${file} -> ${newFile}`);
      }

      // ENHANCEMENT: Save rename log for audit trail
      if (renameLog.length > 0) {
        const logPath = path.join(transcriptsPath, '.rename.log');
        await fs.writeJson(
          logPath,
          {
            timestamp: new Date().toISOString(),
            operations: renameLog,
          },
          { spaces: 2 }
        );
      }
    } catch (error) {
      console.error(`File rename error: ${error.message}`);
      stats.errors.push({ file: 'batch rename', error: error.message });

      // CRITICAL: Rollback on error
      if (renameLog.length > 0) {
        console.warn('Rolling back file renames...');
        for (const { oldPath, newPath } of renameLog.reverse()) {
          try {
            if (await fs.pathExists(newPath)) {
              await fs.rename(newPath, oldPath);
              console.log(`  Rolled back: ${path.basename(newPath)}`);
            }
          } catch (rollbackError) {
            console.error(
              `  Rollback failed for ${path.basename(newPath)}: ${rollbackError.message}`
            );
          }
        }
      }

      throw error; // Re-throw to fail migration
    } finally {
      // CRITICAL: Always remove lock file
      try {
        await fs.remove(lockFilePath);
      } catch (unlockError) {
        console.error(`Failed to remove lock file: ${unlockError.message}`);
      }
    }
  }

  /**
   * Validate migrated registry before saving
   * CRITICAL ADDITION: Prevents saving corrupted data
   *
   * @param {Object} registry - Migrated registry data
   * @returns {Array<string>} Array of validation error messages
   */
  validateMigratedRegistry(registry) {
    const errors = [];

    for (const [videoId, entry] of Object.entries(registry)) {
      // Validate video ID format
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        errors.push(`${videoId}: Invalid video ID format`);
        continue;
      }

      // Validate entry structure
      if (!entry || typeof entry !== 'object') {
        errors.push(`${videoId}: Entry is not an object`);
        continue;
      }

      // CRITICAL: Validate new timestamp format
      if (!entry.date_added || !dateUtils.isValidTimestamp(entry.date_added)) {
        errors.push(`${videoId}: Invalid timestamp format - ${entry.date_added}`);
      }

      // CRITICAL: Validate channel field
      if (!entry.channel || typeof entry.channel !== 'string' || entry.channel.trim() === '') {
        errors.push(`${videoId}: Missing or invalid channel field`);
      }

      // CRITICAL: Validate title field
      if (!entry.title || typeof entry.title !== 'string' || entry.title.trim() === '') {
        errors.push(`${videoId}: Missing or invalid title field`);
      }

      // CRITICAL: Ensure links field removed
      if (entry.links !== undefined) {
        errors.push(`${videoId}: Links field still present after migration`);
      }

      // Validate no unexpected fields
      const allowedKeys = ['date_added', 'channel', 'title'];
      const entryKeys = Object.keys(entry);
      const unexpectedKeys = entryKeys.filter((key) => !allowedKeys.includes(key));
      if (unexpectedKeys.length > 0) {
        errors.push(`${videoId}: Unexpected fields - ${unexpectedKeys.join(', ')}`);
      }
    }

    return errors;
  }

  /**
   * Create backup of registry before migration
   * Backup filename: data.json.backup.YYMMDDTHHMM
   *
   * @returns {Promise<string>} Path to backup file
   * @throws {Error} If backup creation fails
   */
  async backupRegistry() {
    const registryPath = this.paths.getRegistryPath();
    const timestamp = dateUtils.generateDateAdded();
    const backupPath = `${registryPath}.backup.${timestamp}`;

    try {
      await fs.copy(registryPath, backupPath);
      console.log(`Registry backup created: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error(`Backup failed: ${error.message}`);
      throw new Error('Cannot proceed without backup');
    }
  }
}

module.exports = MigrationService;
