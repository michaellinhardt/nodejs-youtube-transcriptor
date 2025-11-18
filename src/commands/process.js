const fs = require('fs-extra');
const path = require('path');
const ConsoleFormatter = require('../utils/ConsoleFormatter');
const StorageService = require('../services/StorageService');
const APIClient = require('../services/APIClient');
const TranscriptService = require('../services/TranscriptService');
const LinkManager = require('../services/LinkManager');
const MaintenanceService = require('../services/MaintenanceService');
const pathResolver = require('../utils/pathResolver');

/**
 * Process Command Handler
 *
 * Implements FR-8.1 main command, TR-1 processing pipeline
 *
 * Workflow:
 * 1. Validate youtube.md exists (FR-1.2)
 * 2. Read and parse URLs (FR-1.1)
 * 3. Deduplicate URLs (business logic)
 * 4. Delegate to TranscriptService.processBatch()
 * 5. Report results
 *
 * Security considerations (TR-13, Security):
 * - Validate file size before reading (max 10MB)
 * - Sanitize URLs before logging
 * - Use absolute paths to prevent traversal attacks
 * - Validate video ID format before processing
 *
 * @returns {Promise<Object>} Result object with success status
 */
async function processCommand() {
  try {
    console.log('\n=== Processing YouTube Transcripts ===\n');

    // Initialize dependencies
    const storageService = new StorageService(pathResolver);
    await storageService.initialize();

    const apiKey = process.env.SCRAPE_CREATORS_API_KEY;
    if (!apiKey) {
      throw new Error(
        'SCRAPE_CREATORS_API_KEY not found in environment. Please set it in .env file.'
      );
    }

    const apiClient = new APIClient(apiKey);
    await apiClient.initialize();

    // Auto-maintenance (implements FR-7.1, TR-14)
    // Initialize LinkManager (required by MaintenanceService)
    const linkManager = new LinkManager(storageService, pathResolver);

    // Initialize MaintenanceService
    const maintenanceService = new MaintenanceService(storageService, linkManager);

    // Run integrity validation before processing URLs
    console.log('[Maintenance] Running integrity validation...');
    const validationResults = await maintenanceService.validateIntegrity();

    // CONDITIONAL OUTPUT: Display validation results only if cleanup occurred or errors found
    // This keeps output clean for healthy registries
    if (validationResults.orphaned > 0 || validationResults.errors.length > 0) {
      console.log('[Maintenance] Validation complete:');
      console.log(`  Entries checked: ${validationResults.checked}`);
      console.log(`  Orphans removed: ${validationResults.orphaned}`);

      // BUG PREVENTION: Check if fields exist before displaying
      if (validationResults.linksRemoved > 0) {
        console.log(`  Links removed: ${validationResults.linksRemoved}`);
      }
      if (validationResults.linksFailed > 0) {
        console.log(`  Links failed to remove: ${validationResults.linksFailed}`);
      }
      if (validationResults.errors.length > 0) {
        console.log(`  Errors encountered: ${validationResults.errors.length}`);
        // Optionally show first few errors for debugging
        if (process.env.DEBUG) {
          console.log('  First errors:');
          validationResults.errors.slice(0, 3).forEach((err) => {
            console.log(`    ${err.videoId}: ${err.error}`);
          });
        }
      }
      console.log('');
    } else {
      // Quiet success - no output needed for clean registries
      console.log('[Maintenance] Registry validation passed\n');
    }

    const transcriptService = new TranscriptService(storageService, apiClient, pathResolver);

    // Step 1: Validate file exists
    const inputFile = await validateInputFile();
    if (!inputFile) {
      // Help already displayed
      return { success: false, reason: 'missing_file' };
    }

    // Step 2: Read and parse URLs
    const content = await readInputFile(inputFile);
    const urls = parseUrls(content);

    console.log(`Found ${urls.length} URL${urls.length !== 1 ? 's' : ''} in youtube.md`);

    const uniqueUrls = deduplicateUrls(urls);

    if (uniqueUrls.length === 0) {
      console.log('\nNo valid YouTube URLs found in youtube.md');
      console.log('Please add YouTube URLs (one per line) and try again.\n');
      return { success: false, reason: 'no_urls' };
    }

    // Step 3: Process URLs
    const results = await processUrls(transcriptService, uniqueUrls);

    // Step 4: Display results
    displayResults(results, uniqueUrls.length);

    return { success: true, results };
  } catch (error) {
    console.error('\nError processing transcripts:', error.message);

    // Show stack trace for debugging
    if (process.env.DEBUG) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    return { success: false, error: error.message };
  }
}

/**
 * Validate youtube.md file exists
 * Implements FR-1.2 help display when missing
 *
 * Security: Uses absolute path, validates file size
 * @returns {Promise<string|null>} File path or null if missing
 */
async function validateInputFile() {
  const inputFile = path.join(process.cwd(), 'youtube.md');

  // NOTE: path.join() with static filename is inherently safe
  // No traversal check needed - inputFile is always cwd/youtube.md

  const exists = await fs.pathExists(inputFile);

  if (!exists) {
    console.error('Error: youtube.md not found in current directory\n');
    displayHelp();
    return null;
  }

  // Security: Validate file size before reading (prevent memory exhaustion)
  const stats = await fs.stat(inputFile);
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per TR performance limits

  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(
      `youtube.md exceeds maximum size (10MB). Current size: ${Math.round(stats.size / 1024 / 1024)}MB`
    );
  }

  return inputFile;
}

/**
 * Display help information
 * Implements FR-1.2 help display
 * Delegates to comprehensive help command (single source of truth)
 */
function displayHelp() {
  const helpCommand = require('./help');
  helpCommand();
}

/**
 * Read youtube.md file content
 * Implements FR-1.1 URL input processing
 *
 * @param {string} filepath - Absolute path to youtube.md
 * @returns {Promise<string>} File content
 * @throws {Error} If read fails
 */
async function readInputFile(filepath) {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return content;
  } catch (error) {
    // TR-13: Handle file system errors
    if (error.code === 'EACCES') {
      throw new Error('Permission denied reading youtube.md - check file permissions');
    }
    throw new Error(`Failed to read youtube.md: ${error.message}`);
  }
}

/**
 * Parse URLs from file content
 * Implements FR-1.1 URL extraction and validation
 *
 * @param {string} content - File content
 * @returns {string[]} Array of valid YouTube URLs
 */
function parseUrls(content) {
  // Handle both Unix (LF) and Windows (CRLF) line endings
  const lines = content.split(/\r?\n/);
  const urls = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    // FR-1.1: Basic YouTube URL validation
    // Accept both youtube.com and youtu.be formats
    if (isYouTubeUrl(trimmed)) {
      urls.push(trimmed);
    } else {
      // Skip invalid URLs with sanitized logging (prevent log injection)
      const sanitized = sanitizeForLog(trimmed);
      console.log(`Skipping invalid URL: ${sanitized}`);
    }
  }

  return urls;
}

/**
 * Check if string is a valid YouTube URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid YouTube URL
 */
function isYouTubeUrl(url) {
  // Security: Basic format validation before processing
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return false;
  }

  // Accept both youtube.com and youtu.be formats
  return url.includes('youtube.com/watch?v=') || url.includes('youtu.be/');
}

/**
 * Remove duplicate URLs while preserving order
 * Implements business logic for efficient processing
 *
 * @param {string[]} urls - Array of URLs
 * @returns {string[]} Deduplicated URLs
 */
function deduplicateUrls(urls) {
  const seen = new Set();
  const unique = [];

  for (const url of urls) {
    if (!seen.has(url)) {
      seen.add(url);
      unique.push(url);
    } else {
      // Sanitize URL for logging
      const sanitized = sanitizeForLog(url);
      console.log(`Skipping duplicate URL: ${sanitized}`);
    }
  }

  if (urls.length !== unique.length) {
    console.log(
      `Removed ${urls.length - unique.length} duplicate URL${urls.length - unique.length !== 1 ? 's' : ''}`
    );
  }

  return unique;
}

/**
 * Sanitize string for safe logging
 * Prevents log injection attacks
 *
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string (max 100 chars, printable ASCII only)
 */
function sanitizeForLog(str) {
  if (typeof str !== 'string') {
    return 'invalid';
  }
  // Limit length and remove non-printable characters
  return str.substring(0, 100).replace(/[^\x20-\x7E]/g, '');
}

/**
 * Process URLs through TranscriptService
 * Implements TR-7 transcript processing workflow via delegation
 *
 * @param {TranscriptService} transcriptService - Service instance
 * @param {string[]} urls - Deduplicated YouTube URLs
 * @param {string} projectDir - Project directory (defaults to cwd)
 * @returns {Promise<Object>} Batch processing results
 */
async function processUrls(transcriptService, urls, projectDir = process.cwd()) {
  // Validate inputs
  if (!urls || urls.length === 0) {
    console.log('No URLs to process');
    return null;
  }

  // Ensure transcripts directory exists
  const transcriptsDir = path.join(projectDir, 'transcripts');

  // TR-13: Handle directory creation errors
  try {
    await fs.ensureDir(transcriptsDir);
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new Error('Permission denied creating ./transcripts directory - check permissions');
    }
    throw new Error(`Failed to create transcripts directory: ${error.message}`);
  }

  console.log(`\nTranscripts will be linked to: ${transcriptsDir}\n`);

  // Delegate to TranscriptService
  // FR-10.1: Service handles errors internally, continues processing
  const results = await transcriptService.processBatch(urls, projectDir);

  return results;
}

/**
 * Display batch processing results
 * Implements user feedback requirements from FR-8.1
 *
 * @param {Object} results - Batch processing results from TranscriptService
 * @param {number} totalUrls - Total number of URLs submitted
 */
function displayResults(results, totalUrls) {
  if (!results) {
    return;
  }

  console.log(''); // Blank line before results

  // Use existing ConsoleFormatter.formatBatchResults for consistency
  const formattedResults = ConsoleFormatter.formatBatchResults(results, totalUrls);

  ConsoleFormatter.displayBox('Processing Complete', formattedResults);

  // Display errors if any (with sanitized URLs)
  if (results.errors && results.errors.length > 0) {
    console.log('Errors encountered:');
    results.errors.forEach((err, index) => {
      // Security: Sanitize URL before logging
      const sanitizedUrl = err.url ? sanitizeForLog(err.url) : 'unknown';
      const sanitizedError = err.error ? err.error.substring(0, 200) : 'unknown error';

      console.log(`  ${index + 1}. ${sanitizedUrl}`);
      console.log(`     ${sanitizedError}`);
    });
    console.log();
  }

  // Success/failure message
  const errorCount = results.errors ? results.errors.length : 0;
  if (errorCount === 0) {
    console.log('All URLs processed successfully!\n');
  } else if (results.processed > 0) {
    console.log(
      `Completed with ${errorCount} error(s). ${results.processed} URL${results.processed !== 1 ? 's' : ''} processed successfully.\n`
    );
  } else {
    console.log(`All URLs failed to process. Please check errors above.\n`);
  }
}

module.exports = processCommand;
