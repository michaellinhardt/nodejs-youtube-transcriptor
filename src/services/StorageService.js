const fs = require('fs-extra');
const path = require('path');
const validators = require('../utils/validators');

/**
 * Storage Service
 *
 * Manages file system persistence and symbolic link operations
 * Implements FR-3, FR-4, FR-9 and TR-19 initialization
 *
 * @class StorageService
 */
class StorageService {
  static ALLOWED_ENTRY_KEYS = ['date_added', 'links'];
  static REGISTRY_WRITE_OPTIONS = {
    spaces: 2,
    encoding: 'utf8',
    EOL: '\n'
  };
  static MAX_TRANSCRIPT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB (TR specs)

  /**
   * @param {Object} pathResolver - Path resolution utility
   */
  constructor(pathResolver) {
    this.paths = pathResolver;
    this.initialized = false;
  }

  /**
   * Initialize storage structure (implements TR-19)
   * Creates ~/.transcriptor directory and data.json if missing
   * Safe to call multiple times (idempotent)
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
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

    // Guard: Reject invalid structure
    if (!this.isValidRegistryStructure(registryData)) {
      throw new Error('Registry validation: Structure does not match expected schema');
    }

    return registryData;
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
      throw new Error(
        'Registry read: Received null error object during file read'
      );
    }

    const isJsonParseError =
      error.name === 'SyntaxError' ||
      error.code === 'EJSONPARSE';

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
      if (!this.isPlainObject(data)) return false;

      for (const [videoId, entry] of Object.entries(data)) {
        if (!this.isValidEntry(videoId, entry)) return false;
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
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    );
  }

  /**
   * Validate single registry entry completely
   * @private
   */
  isValidEntry(videoId, entry) {
    if (!validators.isValidVideoId(videoId)) return false;
    if (!this.isValidEntryStructure(entry)) return false;
    if (!validators.isValidDate(entry.date_added)) return false;
    if (!this.areLinksValid(entry.links)) return false;
    if (!this.hasOnlyAllowedKeys(entry)) return false;
    return true;
  }

  /**
   * Validate registry entry structure
   * Checks entry has required fields with correct types
   * @private
   */
  isValidEntryStructure(entry) {
    if (!this.isPlainObject(entry)) return false;
    if (!entry.date_added || typeof entry.date_added !== 'string') return false;
    if (!Array.isArray(entry.links)) return false;
    return true;
  }

  /**
   * Validate entry has only allowed keys (no extra fields)
   * @private
   */
  hasOnlyAllowedKeys(entry) {
    const entryKeys = Object.keys(entry);
    return entryKeys.every(key =>
      StorageService.ALLOWED_ENTRY_KEYS.includes(key)
    );
  }

  /**
   * Validate all links are non-empty absolute paths
   * @private
   */
  areLinksValid(links) {
    return links.every(link => {
      if (typeof link !== 'string' || link.trim() === '') return false;
      return path.isAbsolute(link);
    });
  }

  /**
   * Save registry to data.json with atomic write (implements TR-8, TR-16)
   * Uses temporary file pattern for crash-safety
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

    const registryPath = this.paths.getRegistryPath();

    try {
      await this.atomicWriteJson(registryPath, data);
    } catch (error) {
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
      const isRenameConflict =
        renameError.code === 'EPERM' ||
        renameError.code === 'EEXIST';

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
   * Build transcript file path for video ID
   * @private
   * @param {string} videoId - YouTube video ID
   * @returns {string} Absolute path to transcript file
   */
  _getTranscriptPath(videoId) {
    return path.join(
      this.paths.getTranscriptsPath(),
      `${videoId}.md`
    );
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

    throw new Error(`Failed to delete transcript ${videoId}: ${error.message}`);
  }

  /**
   * Save transcript content to file (implements FR-2.3, TR-17)
   * Validates inputs, enforces size limits, ensures directory structure
   *
   * @param {string} videoId - YouTube video ID
   * @param {string} content - Transcript text content
   * @returns {Promise<void>}
   * @throws {Error} If video ID invalid, content invalid, or write fails
   */
  async saveTranscript(videoId, content) {
    await this._ensureInitializedWithValidId(videoId, 'save transcript');

    // Guard: Validate content type and non-empty
    if (typeof content !== 'string' || content.length === 0) {
      throw new Error(`Invalid content: must be non-empty string (video ID: ${videoId})`);
    }

    // Guard: Check size limit (10MB per TR specs)
    const contentSizeBytes = Buffer.byteLength(content, 'utf8');
    if (contentSizeBytes > StorageService.MAX_TRANSCRIPT_SIZE_BYTES) {
      throw new Error(
        `Transcript exceeds ${StorageService.MAX_TRANSCRIPT_SIZE_BYTES} byte limit (${contentSizeBytes} bytes): ${videoId}`
      );
    }

    const transcriptPath = this._getTranscriptPath(videoId);

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

    // Write file
    try {
      await fs.writeFile(transcriptPath, content, { encoding: 'utf8' });
    } catch (writeError) {
      throw new Error(`Failed to write transcript ${videoId}: ${writeError.message}`);
    }
  }

  /**
   * Read transcript content from file
   * Returns transcript text for cache hits and data inspection
   *
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<string>} Transcript content
   * @throws {Error} If video ID invalid, file not found, or read fails
   */
  async readTranscript(videoId) {
    await this._ensureInitializedWithValidId(videoId, 'read transcript');

    const transcriptPath = this._getTranscriptPath(videoId);

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
   *
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<boolean>} True if exists and valid, false otherwise
   * @throws {Error} If video ID format invalid
   */
  async transcriptExists(videoId) {
    await this._ensureInitializedWithValidId(videoId, 'check transcript existence');

    const transcriptPath = this._getTranscriptPath(videoId);

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
   *
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<void>}
   * @throws {Error} If video ID invalid or permission denied
   */
  async deleteTranscript(videoId) {
    await this._ensureInitializedWithValidId(videoId, 'delete transcript');

    const transcriptPath = this._getTranscriptPath(videoId);

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
  async createSymlink(source, target) {
    throw new Error('StorageService.createSymlink not yet implemented');
  }

  // NOTE: Orchestration methods (addTranscript, removeTranscript, removeLink, hasTranscript,
  // validateIntegrity, getAllTranscripts, getTranscriptsBeforeDate) have been removed per
  // architectural remediation plan. These high-level workflows will be implemented in
  // TranscriptService (tasks 5.4) and maintenance services (task 7.1) where they properly
  // belong according to FR-3.2, TR-16 specifications.
}

module.exports = StorageService;
