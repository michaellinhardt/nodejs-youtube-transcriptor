const fs = require('fs-extra');
const path = require('path');
const validators = require('../utils/validators');
const RegistryCache = require('./RegistryCache');

/**
 * Storage Service
 *
 * Manages file system persistence and symbolic link operations
 * Implements FR-3, FR-4, FR-9 and TR-19 initialization
 * Enhanced with registry caching for performance (task 9.3.3)
 *
 * @class StorageService
 */
class StorageService {
  static ALLOWED_ENTRY_KEYS = ['date_added', 'channel', 'title'];
  static REGISTRY_WRITE_OPTIONS = {
    spaces: 2,
    encoding: 'utf8',
    EOL: '\n',
  };
  static MAX_TRANSCRIPT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB (TR specs)

  /**
   * @param {Object} pathResolver - Path resolution utility
   */
  constructor(pathResolver) {
    this.paths = pathResolver;
    this.initialized = false;
    this.cache = new RegistryCache();
  }

  /**
   * Initialize storage structure (implements TR-19)
   * Creates ~/.transcriptor directory and data.json if missing
   * Safe to call multiple times (idempotent)
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const storagePath = this.paths.getStoragePath();
    const transcriptsPath = this.paths.getTranscriptsPath();
    const registryPath = this.paths.getRegistryPath();

    try {
      // Ensure directories exist
      await fs.ensureDir(storagePath);
      await fs.ensureDir(transcriptsPath);

      // Initialize registry if missing
      const registryExists = await fs.pathExists(registryPath);
      if (!registryExists) {
        await fs.writeJson(registryPath, {}, { spaces: 2 });
      }
    } catch (error) {
      this.initialized = false;
      console.error('Failed to initialize storage:', error.message);
      throw new Error(`Storage initialization failed: ${error.message}`);
    }
  }

  /**
   * Load registry from data.json (implements FR-3.2)
   * Returns empty object for new installations
   * Validates structure before returning
   * Uses cache for performance on repeated calls
   * UPDATED Task 11.7: Automatic migration on registry load with 4-phase approach
   *
   * @returns {Promise<Object>} Registry data
   * @throws {Error} If registry corrupted or invalid structure
   */
  async loadRegistry() {
    await this.initialize();

    const registryPath = this.paths.getRegistryPath();
    const fileExists = await fs.pathExists(registryPath);

    // Guard: Return empty registry for new installations
    if (!fileExists) {
      return {};
    }

    const registryData = await this.readRegistryFile(registryPath);

    // CRITICAL: Check if migration needed before validation (Task 11.7)
    const MigrationService = require('./MigrationService');
    const migrationService = new MigrationService(this, this.paths);

    if (migrationService.needsMigration(registryData)) {
      console.log('Old registry format detected - migration required');

      let backupPath;
      try {
        // PHASE 1: Create backup first (CRITICAL)
        backupPath = await migrationService.backupRegistry();

        // PHASE 2: Migrate registry entries
        const migratedData = await migrationService.migrateRegistry(registryData);

        // PHASE 3: CRITICAL VALIDATION before save
        console.log('Validating migrated registry...');
        const validationErrors = migrationService.validateMigratedRegistry(migratedData);
        if (validationErrors.length > 0) {
          console.error('Migration validation failed:');
          validationErrors.forEach((err) => console.error(`  - ${err}`));
          throw new Error(`Migration produced ${validationErrors.length} invalid entries`);
        }

        // PHASE 4: Save migrated registry atomically
        await this.saveRegistry(migratedData);

        console.log('Migration complete - registry updated');
        console.log(`Backup preserved at: ${backupPath}`);

        return migratedData;
      } catch (migrationError) {
        console.error('Migration failed:', migrationError.message);

        // CRITICAL: Automatic rollback on failure
        if (backupPath && (await fs.pathExists(backupPath))) {
          console.warn('Rolling back to backup...');
          try {
            await fs.copy(backupPath, registryPath, { overwrite: true });
            console.log('Rollback successful - original registry restored');
          } catch (rollbackError) {
            console.error('CRITICAL: Rollback failed:', rollbackError.message);
            console.error(`Manual restore required from: ${backupPath}`);
          }
        }

        throw new Error(`Migration failed and rolled back: ${migrationError.message}`);
      }
    }

    // Guard: Reject invalid structure (already new format or no migration needed)
    if (!this.isValidRegistryStructure(registryData)) {
      throw new Error('Registry validation: Structure does not match expected schema');
    }

    return registryData;
  }

  /**
   * Load registry metadata only (optimized for statistics)
   * Uses cache to avoid loading full registry
   *
   * @returns {Promise<Array>} Metadata array
   */
  async loadRegistryMetadata() {
    return await this.cache.loadMetadata(async () => {
      return await this.loadRegistry();
    });
  }

  /**
   * Get single registry entry (cache-aware)
   * @param {string} videoId - Video identifier
   * @returns {Promise<Object|undefined>} Registry entry
   */
  async getRegistryEntry(videoId) {
    return await this.cache.getEntry(videoId, async () => {
      return await this.loadRegistry();
    });
  }

  /**
   * Check if registry has entry (cache-aware)
   * @param {string} videoId - Video identifier
   * @returns {Promise<boolean>} True if exists
   */
  async hasRegistryEntry(videoId) {
    return await this.cache.hasEntry(videoId, async () => {
      return await this.loadRegistry();
    });
  }

  /**
   * Read and parse registry JSON file
   * Handles corruption and parse errors
   * @private
   */
  async readRegistryFile(registryPath) {
    let data;

    try {
      data = await fs.readJson(registryPath);
    } catch (error) {
      this.throwRegistryReadError(error);
    }

    return data;
  }

  /**
   * Convert registry read errors to meaningful messages
   * @private
   */
  throwRegistryReadError(error) {
    if (!error) {
      throw new Error('Registry read: Received null error object during file read');
    }

    const isJsonParseError = error.name === 'SyntaxError' || error.code === 'EJSONPARSE';

    if (isJsonParseError) {
      const message = error.message || 'unknown JSON parse error';
      throw new Error(`Registry read: File corrupted with JSON parse error - ${message}`);
    }

    throw error;
  }

  /**
   * Validate registry structure
   * Ensures data matches expected schema
   *
   * @param {*} data - Data to validate
   * @returns {boolean} True if valid, false otherwise
   * @private
   */
  isValidRegistryStructure(data) {
    try {
      if (!this.isPlainObject(data)) {
        return false;
      }

      for (const [videoId, entry] of Object.entries(data)) {
        if (!this.isValidEntry(videoId, entry)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.warn(`Registry validation threw exception: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate registry is plain object (not null or array)
   * @private
   */
  isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /**
   * Validate single registry entry completely
   * @private
   */
  isValidEntry(videoId, entry) {
    if (!validators.isValidVideoId(videoId)) {
      return false;
    }
    if (!this.isValidEntryStructure(entry)) {
      return false;
    }
    if (!validators.isValidDate(entry.date_added)) {
      return false;
    }
    // REMOVED: links validation (Task 11.4 - field no longer allowed)
    if (!this.hasOnlyAllowedKeys(entry)) {
      return false;
    }
    return true;
  }

  /**
   * Validate registry entry structure
   * Checks entry has required fields with correct types
   * Implements FR-3.2 registry schema with metadata fields
   * @private
   */
  isValidEntryStructure(entry) {
    if (!this.isPlainObject(entry)) {
      return false;
    }
    if (!entry.date_added || typeof entry.date_added !== 'string') {
      return false;
    }

    // REMOVED: links field validation (Task 11.4 - field no longer allowed)

    // Channel optional (backward compatibility) but must be non-empty string if present
    if (entry.channel !== undefined) {
      if (typeof entry.channel !== 'string' || entry.channel.trim() === '') {
        return false;
      }
      // CRITICAL: Validate channel length (prevent abuse)
      if (entry.channel.length > 200) {
        console.warn(`Channel name exceeds 200 chars`);
        return false;
      }
    }

    // Title optional (backward compatibility) but must be non-empty string if present
    if (entry.title !== undefined) {
      if (typeof entry.title !== 'string' || entry.title.trim() === '') {
        return false;
      }
      // CRITICAL: Validate title length (prevent abuse)
      if (entry.title.length > 500) {
        console.warn(`Title exceeds 500 chars`);
        return false;
      }
    }

    return true;
  }

  /**
   * Validate entry has only allowed keys (no extra fields)
   * @private
   */
  hasOnlyAllowedKeys(entry) {
    const entryKeys = Object.keys(entry);
    return entryKeys.every((key) => StorageService.ALLOWED_ENTRY_KEYS.includes(key));
  }

  // REMOVED: areLinksValid method (Task 11.4 - links field no longer in schema)

  /**
   * Save registry to data.json with atomic write (implements TR-8, TR-16)
   * Uses temporary file pattern for crash-safety
   * Invalidates cache before write for consistency
   *
   * @param {Object} data - Registry data to save
   * @returns {Promise<void>}
   * @throws {Error} If data invalid or write fails
   */
  async saveRegistry(data) {
    await this.initialize();

    // Guard: Validate before attempting write
    if (!this.isValidRegistryStructure(data)) {
      throw new Error('Registry save: Invalid structure provided (failed validation)');
    }

    // Invalidate cache BEFORE write (fail-safe consistency)
    this.cache.startWrite();

    const registryPath = this.paths.getRegistryPath();

    try {
      await this.atomicWriteJson(registryPath, data);
      this.cache.endWrite();
    } catch (error) {
      this.cache.endWrite();
      throw new Error(`Failed to save registry: ${error.message}`);
    }
  }

  /**
   * Atomic write using temporary file pattern (implements TR-8)
   * Writes to .tmp file then renames for crash-safety
   * @private
   */
  async atomicWriteJson(targetPath, data) {
    const tempPath = `${targetPath}.tmp`;

    try {
      await this.writeTemporaryFile(tempPath, data);
      await this.verifyTemporaryFile(tempPath);
      await this.replaceTargetFile(tempPath, targetPath);
    } catch (error) {
      await this.cleanupTemporaryFile(tempPath);
      throw error;
    }
  }

  /**
   * Write data to temporary file
   * @private
   */
  async writeTemporaryFile(tempPath, data) {
    await fs.ensureDir(path.dirname(tempPath));
    await fs.writeJson(tempPath, data, StorageService.REGISTRY_WRITE_OPTIONS);
  }

  /**
   * Verify temporary file was written successfully
   * @private
   */
  async verifyTemporaryFile(tempPath) {
    const tempExists = await fs.pathExists(tempPath);
    if (!tempExists) {
      throw new Error('Temporary file write verification failed');
    }
  }

  /**
   * Replace target file with temporary file (atomic rename)
   * Handles cross-platform rename quirks
   * @private
   */
  async replaceTargetFile(tempPath, targetPath) {
    try {
      await fs.rename(tempPath, targetPath);
    } catch (renameError) {
      // Windows rename fails with EPERM when target exists
      // Some systems use EEXIST for same condition
      const isRenameConflict = renameError.code === 'EPERM' || renameError.code === 'EEXIST';

      if (isRenameConflict) {
        await fs.move(tempPath, targetPath, { overwrite: true });
      } else {
        throw renameError;
      }
    }
  }

  /**
   * Clean up temporary file on write failure
   * Logs cleanup errors but doesn't throw
   * @private
   */
  async cleanupTemporaryFile(tempPath) {
    try {
      const tempExists = await fs.pathExists(tempPath);
      if (tempExists) {
        await fs.remove(tempPath);
      }
    } catch (cleanupError) {
      console.warn(`Temp file cleanup failed: ${cleanupError.message}`);
    }
  }

  /**
   * Ensure storage initialized and video ID valid
   * @private
   * @param {string} videoId - Video ID to validate
   * @param {string} operation - Operation name for error context
   * @returns {Promise<void>}
   * @throws {Error} If initialization fails or video ID invalid
   */
  async _ensureInitializedWithValidId(videoId, operation) {
    try {
      await this.initialize();
    } catch (initError) {
      throw new Error(`Cannot ${operation} (initialization failed): ${initError.message}`);
    }

    if (!validators.isValidVideoId(videoId)) {
      throw new Error(`Invalid video ID format: ${videoId}`);
    }
  }

  /**
   * Build transcript filename from video ID and metadata
   * CRITICAL: Implements FR-2.4, TR-23 metadata-based naming
   * UPDATED: Uses tr_ prefix for filenames
   * @param {string} videoId - YouTube video ID
   * @param {Object} metadata - {channel, title} (optional for backward compatibility)
   * @returns {string} Filename: tr_{videoId}_{formattedTitle}.md or tr_{videoId}.md
   */
  async buildFilename(videoId, metadata) {
    // Backward compatibility: old format if no metadata (with tr_ prefix)
    if (!metadata || !metadata.title) {
      return `tr_${videoId}.md`;
    }

    // Format title for filesystem safety
    const MetadataService = require('./MetadataService');
    const metadataService = new MetadataService();
    const formattedTitle = metadataService.formatTitle(metadata.title);

    // Construct base filename with tr_ prefix
    let filename = `tr_${videoId}_${formattedTitle}.md`;

    // CRITICAL: Validate total length < 255 (filesystem limit)
    // Account for prefix: 3 chars for "tr_"
    if (filename.length > 255) {
      // Truncate formatted title to fit
      const maxTitleLength = 255 - 3 - videoId.length - 4; // 3 for "tr_", 4 for "_.md"
      const truncatedTitle = formattedTitle.substring(0, maxTitleLength);
      filename = `tr_${videoId}_${truncatedTitle}.md`;
    }

    // CRITICAL: Handle filename collisions (different videos, same sanitized title)
    const transcriptsPath = this.paths.getTranscriptsPath();
    let finalFilename = filename;
    let collisionIndex = 2;

    // Check for existing files with different video IDs
    while (await fs.pathExists(path.join(transcriptsPath, finalFilename))) {
      // Read existing file to check video ID
      const existingContent = await fs.readFile(
        path.join(transcriptsPath, finalFilename),
        'utf8'
      );

      // If same video ID, this is the correct file (updating metadata)
      if (existingContent.includes(`Youtube ID: ${videoId}`)) {
        break;
      }

      // Different video ID - add collision suffix
      const baseName = filename.replace('.md', '');
      finalFilename = `${baseName}_${collisionIndex}.md`;
      collisionIndex++;

      // Safety limit to prevent infinite loop
      if (collisionIndex > 100) {
        throw new Error(`Excessive filename collisions for: ${filename}`);
      }
    }

    return finalFilename;
  }

  /**
   * Build transcript file path for video ID
   * @private
   * @param {string} videoId - YouTube video ID
   * @param {Object} metadata - {channel, title} (optional)
   * @returns {Promise<string>} Absolute path to transcript file
   */
  async _getTranscriptPath(videoId, metadata) {
    const filename = await this.buildFilename(videoId, metadata);
    return path.join(this.paths.getTranscriptsPath(), filename);
  }

  /**
   * Build metadata header for transcript file
   * CRITICAL: Implements FR-11, TR-27 metadata header
   * @param {Object} metadata - {channel, title}
   * @param {string} videoId - Video ID
   * @returns {string} Formatted header
   */
  buildMetadataHeader(metadata, videoId) {
    const { channel, title } = metadata;

    // Validate inputs
    if (!channel || !title || !videoId) {
      throw new Error('All metadata fields required for header generation');
    }

    // Build short URL with validation
    const MetadataService = require('./MetadataService');
    const metadataService = new MetadataService();
    const shortUrl = metadataService.buildShortUrl(videoId);

    // Format header with markdown structure (preserve original title, no sanitization)
    const header = [
      `# Transcript`,
      ``,
      `## Information`,
      ``,
      `Channel: ${channel}`,
      `Title: ${title}`,
      `Youtube ID: ${videoId}`,
      `URL: ${shortUrl}`,
      ``,
      `## Content`,
      ``,
    ].join('\n');

    return header;
  }

  /**
   * Handle read operation errors with consistent patterns
   * @private
   * @param {Error} error - File system error
   * @param {string} videoId - Video ID for context
   * @param {string} operation - Operation description
   * @throws {Error} Contextualized error
   */
  _handleReadError(error, videoId, operation) {
    if (error.code === 'ENOENT') {
      throw new Error(`Transcript not found: ${videoId}`);
    }

    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw new Error(`Permission denied ${operation} transcript ${videoId}`);
    }

    if (error.code === 'EINVAL') {
      throw new Error(
        `Invalid path for transcript ${videoId}. ` +
          'Path may contain unsupported characters or exceed length limits.'
      );
    }

    // Re-throw with original context for unexpected errors
    throw error;
  }

  /**
   * Handle existence check errors (returns false instead of throwing)
   * @private
   * @param {Error} error - File system error
   * @param {string} videoId - Video ID for context
   * @returns {boolean} Always false (non-existent or inaccessible)
   */
  _handleExistenceCheckError(error, videoId) {
    if (error.code === 'ENOENT') {
      return false;
    }

    if (error.code === 'EACCES' || error.code === 'EPERM') {
      console.warn(`Permission denied checking transcript ${videoId}`);
      return false;
    }

    if (error.code === 'EINVAL') {
      console.warn(`Invalid path for transcript ${videoId}: ${error.message}`);
      return false;
    }

    console.warn(`Existence check failed for ${videoId}: ${error.message}`);
    return false;
  }

  /**
   * Handle delete operation errors
   * @private
   * @param {Error} error - File system error
   * @param {string} videoId - Video ID for context
   * @throws {Error} Contextualized error (or returns for ENOENT)
   */
  _handleDeleteError(error, videoId) {
    // Idempotent - already deleted is success
    if (error.code === 'ENOENT') {
      return;
    }

    if (error.code === 'EISDIR' || error.code === 'EPERM') {
      throw new Error(`Cannot delete: path is not a file (${videoId})`);
    }

    if (error.code === 'EACCES') {
      throw new Error(`Permission denied deleting transcript ${videoId}`);
    }

    if (error.code === 'EINVAL') {
      throw new Error(
        `Invalid path for transcript ${videoId}. ` +
          'Path may contain unsupported characters or exceed length limits.'
      );
    }

    throw new Error(`Failed to delete transcript ${videoId}: ${error.message}`);
  }

  /**
   * Save transcript content to file (implements FR-2.3, TR-17, FR-11)
   * Validates inputs, enforces size limits, ensures directory structure
   * Supports metadata headers and metadata-based filenames
   *
   * @param {string} videoId - YouTube video ID
   * @param {string} content - Transcript text content
   * @param {Object} metadata - {channel, title} (optional for backward compatibility)
   * @returns {Promise<string>} Absolute path to saved file
   * @throws {Error} If video ID invalid, content invalid, or write fails
   */
  async saveTranscript(videoId, content, metadata) {
    await this._ensureInitializedWithValidId(videoId, 'save transcript');

    // Guard: Validate content type and non-empty
    if (typeof content !== 'string' || content.length === 0) {
      throw new Error(`Invalid content: must be non-empty string (video ID: ${videoId})`);
    }

    // Build file content with optional metadata header
    let fileContent = content;
    if (metadata && metadata.channel && metadata.title) {
      const header = this.buildMetadataHeader(metadata, videoId);
      fileContent = `${header}\n${content}\n`;
    }

    // Validate size BEFORE building filename (fail fast)
    const contentSizeBytes = Buffer.byteLength(fileContent, 'utf8');
    if (contentSizeBytes > StorageService.MAX_TRANSCRIPT_SIZE_BYTES) {
      throw new Error(
        `Transcript exceeds ${StorageService.MAX_TRANSCRIPT_SIZE_BYTES} byte limit (${contentSizeBytes} bytes): ${videoId}`
      );
    }

    // Build filename with collision detection
    const filename = await this.buildFilename(videoId, metadata);
    const transcriptPath = path.join(this.paths.getTranscriptsPath(), filename);

    // Ensure directory exists with explicit race handling
    try {
      await fs.ensureDir(path.dirname(transcriptPath));
    } catch (dirError) {
      // EEXIST is safe to ignore (another process created it)
      if (dirError.code !== 'EEXIST') {
        throw new Error(`Failed to create transcript directory: ${dirError.message}`);
      }
      // If EEXIST, directory exists - continue to write
    }

    // Write file atomically
    const tempPath = `${transcriptPath}.tmp`;
    try {
      await fs.writeFile(tempPath, fileContent, 'utf8');
      await fs.rename(tempPath, transcriptPath);
    } catch (error) {
      // Clean up temp file on failure
      await fs.remove(tempPath).catch(() => {});
      throw new Error(`Failed to write transcript ${videoId}: ${error.message}`);
    }

    // CRITICAL: Invalidate registry cache after file write
    this.cache.invalidate();

    return transcriptPath;
  }

  /**
   * Get transcript file path (searches for metadata-based filenames)
   * UPDATED Task 11.3: Searches NEW pattern first, falls back to OLD
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<string|null>} File path or null if not found
   */
  async getTranscriptPath(videoId) {
    const transcriptsPath = this.paths.getTranscriptsPath();

    try {
      const files = await fs.readdir(transcriptsPath);

      // PRIORITY 1: Search for NEW pattern first (tr_ prefix)
      let match = files.find(
        (file) =>
          (file.startsWith(`tr_${videoId}_`) && file.endsWith('.md')) ||
          file === `tr_${videoId}.md`
      );

      // PRIORITY 2: Fallback to OLD pattern for backward compatibility (transcript_ prefix)
      if (!match) {
        match = files.find(
          (file) =>
            (file.startsWith(`transcript_${videoId}_`) && file.endsWith('.md')) ||
            file === `transcript_${videoId}.md`
        );
      }

      // PRIORITY 3: Fallback to OLDEST pattern for backward compatibility (no prefix)
      if (!match) {
        match = files.find(
          (file) =>
            (file.startsWith(`${videoId}_`) && file.endsWith('.md')) || file === `${videoId}.md`
        );
      }

      return match ? path.join(transcriptsPath, match) : null;
    } catch (error) {
      console.warn(`Error finding transcript for ${videoId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Read transcript content from file
   * Returns transcript text for cache hits and data inspection
   * Supports both old and new filename formats
   *
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<string>} Transcript content
   * @throws {Error} If video ID invalid, file not found, or read fails
   */
  async readTranscript(videoId) {
    await this._ensureInitializedWithValidId(videoId, 'read transcript');

    const transcriptPath = await this.getTranscriptPath(videoId);

    if (!transcriptPath) {
      throw new Error(`Transcript not found: ${videoId}`);
    }

    try {
      const content = await fs.readFile(transcriptPath, { encoding: 'utf8' });

      // Guard: Reject empty files (corrupted data)
      if (content.length === 0) {
        throw new Error(`Transcript file is empty: ${videoId}`);
      }

      return content;
    } catch (error) {
      this._handleReadError(error, videoId, 'reading');
    }
  }

  /**
   * Check if transcript file exists
   * Fast existence check for cache-first strategy
   * Supports both old and new filename formats
   *
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<boolean>} True if exists and valid, false otherwise
   * @throws {Error} If video ID format invalid
   */
  async transcriptExists(videoId) {
    await this._ensureInitializedWithValidId(videoId, 'check transcript existence');

    const transcriptPath = await this.getTranscriptPath(videoId);

    if (!transcriptPath) {
      return false;
    }

    try {
      const stats = await fs.stat(transcriptPath);
      return stats.isFile() && stats.size > 0;
    } catch (error) {
      return this._handleExistenceCheckError(error, videoId);
    }
  }

  /**
   * Delete transcript file (implements FR-6.2)
   * Idempotent operation - succeeds if file already deleted
   * Does not modify registry or links (separation of concerns)
   * Supports both old and new filename formats
   *
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<void>}
   * @throws {Error} If video ID invalid or permission denied
   */
  async deleteTranscript(videoId) {
    await this._ensureInitializedWithValidId(videoId, 'delete transcript');

    const transcriptPath = await this.getTranscriptPath(videoId);

    if (!transcriptPath) {
      // File already deleted - idempotent
      return;
    }

    try {
      await fs.unlink(transcriptPath);
    } catch (error) {
      this._handleDeleteError(error, videoId);
    }
  }

  /**
   * Create symbolic link to transcript (implements FR-4, TR-9)
   *
   * @param {string} source - Source file path (central storage)
   * @param {string} target - Target link path (project directory)
   * @returns {Promise<void>}
   * @throws {Error} Not yet implemented
   */
  async createSymlink(_source, _target) {
    throw new Error('StorageService.createSymlink not yet implemented');
  }

  // NOTE: Orchestration methods (addTranscript, removeTranscript, removeLink, hasTranscript,
  // validateIntegrity, getAllTranscripts, getTranscriptsBeforeDate) have been removed per
  // architectural remediation plan. These high-level workflows will be implemented in
  // TranscriptService (tasks 5.4) and maintenance services (task 7.1) where they properly
  // belong according to FR-3.2, TR-16 specifications.
}

module.exports = StorageService;
