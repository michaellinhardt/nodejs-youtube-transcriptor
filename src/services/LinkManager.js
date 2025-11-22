const fs = require('fs-extra');
const path = require('path');
const validators = require('../utils/validators');

/**
 * Link Manager Service
 *
 * Manages symbolic link operations between central transcript storage
 * and project-local directories. Implements FR-4, TR-9.
 *
 * @class LinkManager
 */
class LinkManager {
  /**
   * @param {StorageService} storageService - Storage layer dependency
   * @param {Object} pathResolver - Path resolution utility
   */
  constructor(storageService, pathResolver) {
    // Guard: Validate dependencies injected
    if (!storageService) {
      throw new Error('LinkManager requires StorageService dependency');
    }
    if (!pathResolver) {
      throw new Error('LinkManager requires PathResolver dependency');
    }

    this.storage = storageService;
    this.paths = pathResolver;
  }

  /**
   * Create symbolic link for transcript in project directory
   * Implements FR-4.1, TR-9 with cross-platform support
   * Supports metadata-based filenames
   *
   * @param {string} videoId - YouTube video identifier (11 chars)
   * @param {string} projectDir - Absolute path to project directory
   * @returns {Promise<Object>} Result with success, path, replaced flags
   * @throws {Error} If validation fails or link creation fails
   */
  async createLink(videoId, projectDir = process.cwd()) {
    // Security: Validate videoId format first
    if (!validators.isValidVideoId(videoId)) {
      throw new Error(`Invalid video ID format: ${videoId}`);
    }

    // Security: Validate projectDir is absolute and safe
    const absoluteProjectDir = path.resolve(projectDir);
    if (!path.isAbsolute(absoluteProjectDir)) {
      throw new Error('Project directory must be absolute path');
    }

    // Find existing transcript file (handles both old and new filename formats)
    const sourcePath = await this.storage.getTranscriptPath(videoId);
    if (!sourcePath) {
      throw new Error(`Source transcript not found: ${videoId}`);
    }

    // Use same filename for target as source
    const sourceFilename = path.basename(sourcePath);
    const targetDir = path.join(absoluteProjectDir, 'transcripts');
    const targetPath = path.join(targetDir, sourceFilename);

    // Validate source exists
    if (!(await fs.pathExists(sourcePath))) {
      throw new Error(`Source transcript not found: ${videoId} at ${sourcePath}`);
    }

    // Ensure target directory with race condition handling
    try {
      await fs.ensureDir(targetDir);
    } catch (dirError) {
      // EEXIST is safe (another process created it)
      if (dirError.code !== 'EEXIST') {
        throw new Error(`Failed to create target directory: ${dirError.message}`);
      }
    }

    // Check target status
    const validation = await this.validateTarget(targetPath);

    if (!validation.canProceed) {
      throw new Error(`Cannot create symlink: ${validation.message}\nPath: ${targetPath}`);
    }

    // Log if overwriting existing symlink
    if (validation.status === 'symlink' || validation.status === 'broken_symlink') {
      console.log(`[Link] Replacing existing link: ${targetPath}`);
    }

    try {
      // fs-extra ensureSymlink handles platform differences and overwrites
      // 'file' type ensures cross-platform compatibility per TR-9
      await fs.ensureSymlink(sourcePath, targetPath, 'file');

      // Track in registry AFTER successful link creation
      await this._trackLink(videoId, targetPath);

      return {
        success: true,
        path: targetPath,
        replaced: validation.status !== 'none',
      };
    } catch (error) {
      // Windows-specific guidance per TR-9 requirements
      if (error.code === 'EPERM' && process.platform === 'win32') {
        throw new Error(
          'Symbolic link creation requires elevated privileges on Windows.\n' +
            'Solutions:\n' +
            '1. Enable Developer Mode (Settings > Update & Security > For Developers)\n' +
            '2. Run terminal as Administrator\n' +
            'See: https://docs.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development'
        );
      }

      if (error.code === 'EINVAL') {
        throw new Error(
          `Invalid path for symlink creation (${videoId}).\n` +
            `Source: ${sourcePath}\n` +
            `Target: ${targetPath}\n` +
            'Path may contain unsupported characters, null bytes, or create circular reference.'
        );
      }

      // Platform-agnostic error
      throw new Error(`Symlink creation failed for ${videoId}: ${error.message}`);
    }
  }

  /**
   * Validate target path before link creation
   * Detects conflicts and broken links
   *
   * @param {string} targetPath - Absolute path to target location
   * @returns {Promise<Object>} Validation result with status and canProceed flag
   * @private
   */
  async validateTarget(targetPath) {
    // Security: Validate path is absolute
    if (!path.isAbsolute(targetPath)) {
      throw new Error(`Target path must be absolute: ${targetPath}`);
    }

    try {
      const exists = await fs.pathExists(targetPath);
      if (!exists) {
        return { status: 'none', canProceed: true };
      }

      const stats = await fs.lstat(targetPath); // lstat doesn't follow symlinks

      if (stats.isSymbolicLink()) {
        try {
          const linkTarget = await fs.readlink(targetPath);

          // Check if symlink is broken by trying to access the target
          const targetExists = await fs.pathExists(targetPath); // This follows symlink

          if (!targetExists) {
            return {
              status: 'broken_symlink',
              canProceed: true,
              message: 'Broken symlink will be replaced',
              existing: linkTarget,
            };
          }

          return {
            status: 'symlink',
            canProceed: true,
            existing: linkTarget,
            message: 'Valid symlink will be replaced if different source',
          };
        } catch (readlinkError) {
          // Symlink exists but readlink failed (permission issue)
          return {
            status: 'broken_symlink',
            canProceed: true,
            message: `Symlink unreadable (${readlinkError.code}), will be replaced`,
          };
        }
      } else if (stats.isFile()) {
        return {
          status: 'file',
          canProceed: false,
          message: 'Regular file exists at target path - manual intervention required',
        };
      } else if (stats.isDirectory()) {
        return {
          status: 'directory',
          canProceed: false,
          message: 'Directory exists at target path - manual intervention required',
        };
      } else {
        // Unknown file type (socket, device, etc.)
        return {
          status: 'unknown',
          canProceed: false,
          message: `Unknown file type at target path: ${stats.mode}`,
        };
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { status: 'none', canProceed: true };
      }

      // Permission errors during validation
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        return {
          status: 'permission_denied',
          canProceed: false,
          message: `Permission denied accessing target path: ${targetPath}`,
        };
      }

      if (error.code === 'EINVAL') {
        return {
          status: 'invalid_path',
          canProceed: false,
          message: `Invalid path format: ${targetPath}. May contain unsupported characters.`,
        };
      }

      throw error;
    }
  }

  /**
   * Track link in registry after successful creation (DEPRECATED in Task 11.4)
   * UPDATED Task 11.4: Links are no longer tracked in registry - links array removed from schema
   * Symbolic links are still created in ./transcripts but not tracked in data.json
   *
   * @param {string} videoId - YouTube video identifier
   * @param {string} linkPath - Path to created link
   * @returns {Promise<void>}
   * @private
   */
  async _trackLink(videoId, linkPath) {
    // UPDATED Task 11.4: Links no longer tracked in registry
    // Symbolic links are still created in ./transcripts but not tracked in data.json
    // This method is now a no-op
    const absolutePath = path.resolve(linkPath);
    console.log(`[Link] Created (not tracked in registry): ${absolutePath}`);
  }

  /**
   * Remove single symbolic link
   * Idempotent - succeeds if link already deleted
   *
   * @param {string} linkPath - Absolute path to link
   * @returns {Promise<Object>} Result with success, path, skipped flags
   * @throws {Error} If not a symlink or permission denied
   */
  async removeLink(linkPath) {
    // Security: Validate path is absolute
    if (!path.isAbsolute(linkPath)) {
      throw new Error(`Link path must be absolute: ${linkPath}`);
    }

    try {
      // Verify it's actually a symlink before deletion (safety check)
      const stats = await fs.lstat(linkPath);

      if (!stats.isSymbolicLink()) {
        throw new Error(`Path is not a symbolic link: ${linkPath}`);
      }

      await fs.unlink(linkPath);
      return { success: true, path: linkPath };
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Link already removed, not an error (idempotent)
        return { success: true, path: linkPath, skipped: true };
      }

      if (error.code === 'EACCES' || error.code === 'EPERM') {
        throw new Error(`Permission denied removing link: ${linkPath}`);
      }

      if (error.code === 'EINVAL') {
        throw new Error(
          `Invalid path for link removal: ${linkPath}. ` +
            'Path may contain unsupported characters.'
        );
      }

      throw error;
    }
  }

  /**
   * Remove all tracked links for a video ID
   * Updates registry to remove successfully deleted links
   *
   * @param {string} videoId - YouTube video identifier
   * @returns {Promise<Object>} Results with removed, skipped, errors counts
   */
  async removeAllLinks(videoId) {
    // Security: Validate videoId format
    if (!validators.isValidVideoId(videoId)) {
      throw new Error(`Invalid video ID format: ${videoId}`);
    }

    const registry = await this.storage.loadRegistry();
    const entry = registry[videoId];

    // Guard: Handle missing or empty entries
    if (!entry) {
      return { removed: 0, skipped: 0, errors: [], message: 'No registry entry found' };
    }

    if (!Array.isArray(entry.links) || entry.links.length === 0) {
      return { removed: 0, skipped: 0, errors: [], message: 'No links to remove' };
    }

    const results = {
      removed: 0,
      skipped: 0,
      errors: [],
    };

    // Process all links (fail-safe: continue on errors)
    for (const linkPath of entry.links) {
      try {
        const result = await this.removeLink(linkPath);
        if (result.skipped) {
          results.skipped++;
        } else {
          results.removed++;
        }
      } catch (error) {
        results.errors.push({
          path: linkPath,
          error: error.message,
          code: error.code,
        });
      }
    }

    // Update registry: Keep only links that failed to delete
    const failedPaths = results.errors.map((e) => e.path);
    entry.links = entry.links.filter((link) => failedPaths.includes(link));

    // Save registry if any changes occurred
    if (results.removed > 0 || results.skipped > 0) {
      try {
        await this.storage.saveRegistry(registry);
      } catch (saveError) {
        // Critical: Links removed but registry update failed
        console.error(
          `[Link] Links removed but registry update failed for ${videoId}: ${saveError.message}`
        );
        results.registryUpdateFailed = true;
      }
    }

    return results;
  }
}

module.exports = LinkManager;
