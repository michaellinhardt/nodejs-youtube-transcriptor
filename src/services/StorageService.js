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
   * Save transcript content to file (implements FR-2.3, TR-17)
   *
   * @param {string} videoId - YouTube video ID
   * @param {string} content - Transcript text content
   * @returns {Promise<void>}
   * @throws {Error} Not yet implemented
   */
  async saveTranscript(videoId, content) {
    throw new Error('StorageService.saveTranscript not yet implemented');
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

  /**
   * Delete transcript file (implements FR-6.2)
   *
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<void>}
   * @throws {Error} Not yet implemented
   */
  async deleteTranscript(videoId) {
    throw new Error('StorageService.deleteTranscript not yet implemented');
  }

  // NOTE: Orchestration methods (addTranscript, removeTranscript, removeLink, hasTranscript,
  // validateIntegrity, getAllTranscripts, getTranscriptsBeforeDate) have been removed per
  // architectural remediation plan. These high-level workflows will be implemented in
  // TranscriptService (tasks 5.4) and maintenance services (task 7.1) where they properly
  // belong according to FR-3.2, TR-16 specifications.
}

module.exports = StorageService;
