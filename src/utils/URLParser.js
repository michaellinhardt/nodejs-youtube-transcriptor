const fs = require('fs-extra');
const path = require('path');
const URLValidator = require('./URLValidator');
const ValidationHelpers = require('./ValidationHelpers');

/**
 * URLParser - Extracts and validates YouTube video IDs from youtube.md files
 *
 * Implements FR-1.1 (URL Input Processing) and TR-5 (ParseURLs algorithm)
 *
 * @class URLParser
 */
class URLParser {
  static DEFAULT_INPUT_FILE = 'youtube.md';
  static MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit (TR-Performance)
  static MAX_LINE_LENGTH = 10 * 1024; // 10KB per line (DoS prevention)
  static MAX_URL_COUNT = 1000; // TR-Performance limit
  static ALLOWED_SCHEMES = ['http:', 'https:', '']; // Empty string for protocol-less URLs


  /**
   * Creates URLParser instance
   * @param {string} [inputFile='youtube.md'] - Input filename to parse
   */
  constructor(inputFile = URLParser.DEFAULT_INPUT_FILE) {
    this.inputFile = inputFile;
  }

  /**
   * Parse YouTube URLs from markdown file
   *
   * Reads youtube.md from specified directory and extracts video IDs.
   * Skips invalid URLs, removes duplicates, preserves order.
   *
   * @param {string} [workingDir=process.cwd()] - Directory containing youtube.md
   * @returns {Promise<string[]>} Array of unique 11-character video IDs
   * @throws {Error} If file not found, permission denied, or security violation
   *
   * @example
   * const parser = new URLParser();
   * const videoIds = await parser.parseFile('/path/to/project');
   * // Returns: ['dQw4w9WgXcQ', 'jNQXAC9IVRw']
   */
  async parseFile(workingDir = process.cwd()) {
    let filePath;

    try {
      filePath = this.resolveSecurePath(workingDir, this.inputFile);
    } catch (error) {
      throw new Error(
        `Security validation failed: ${error.message}\n` +
        `Ensure ${this.inputFile} is in the working directory`
      );
    }

    try {
      await this.validateFileSize(filePath);
      const content = await this.readFile(filePath);
      this.validateFileContent(content);
      return this.parseContent(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `YouTube URL file not found: ${filePath}\n` +
          `Please create ${this.inputFile} with one YouTube URL per line`
        );
      }

      if (error.code === 'EACCES') {
        throw new Error(
          `Permission denied reading ${filePath}\n` +
          `Check file permissions and try again`
        );
      }

      if (error.code === 'EISDIR') {
        throw new Error(
          `Path is a directory, not a file: ${filePath}\n` +
          `Expected a text file named ${this.inputFile}`
        );
      }

      if (error.message.includes('File too large') ||
          error.message.includes('Invalid file format') ||
          error.message.includes('Security validation')) {
        throw error;
      }

      throw new Error(`Failed to read ${filePath}: ${error.message}`);
    }
  }

  /**
   * Resolves file path and validates against path traversal attacks
   * @param {string} workingDir - Base working directory
   * @param {string} filename - Filename to resolve
   * @returns {string} Resolved absolute path
   * @throws {Error} If path traversal detected
   */
  resolveSecurePath(workingDir, filename) {
    const resolved = path.resolve(workingDir, filename);
    const normalizedWorkDir = path.resolve(workingDir);

    if (!resolved.startsWith(normalizedWorkDir)) {
      throw new Error('Path traversal attempt detected');
    }

    return resolved;
  }

  /**
   * Validates file size before reading to prevent memory exhaustion
   * @param {string} filePath - Path to validate
   * @throws {Error} If file exceeds MAX_FILE_SIZE
   */
  async validateFileSize(filePath) {
    const stats = await fs.stat(filePath);

    if (stats.size > URLParser.MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB exceeds ` +
        `${URLParser.MAX_FILE_SIZE / 1024 / 1024}MB limit`
      );
    }
  }

  /**
   * Validates file content is text, not binary
   * @param {string} content - File content to validate
   * @throws {Error} If binary content detected
   */
  validateFileContent(content) {
    if (this.detectBinaryContent(content.slice(0, 8000))) {
      throw new Error('Invalid file format: youtube.md must be a text file');
    }
  }

  /**
   * Detects binary content by checking for null bytes and non-printable characters
   * @param {string} sample - Content sample to check
   * @returns {boolean} True if binary content detected
   */
  detectBinaryContent(sample) {
    const nullByteIndex = sample.indexOf('\0');
    if (nullByteIndex !== -1) {
      return true;
    }

    let nonPrintable = 0;
    for (let i = 0; i < Math.min(sample.length, 1000); i++) {
      const code = sample.charCodeAt(i);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        nonPrintable++;
      }
    }

    return nonPrintable > sample.length * 0.1;
  }

  /**
   * Reads file content
   * @param {string} filePath - Path to read
   * @returns {Promise<string>} File content
   */
  async readFile(filePath) {
    return await fs.readFile(filePath, 'utf-8');
  }

  /**
   * Parses file content and extracts video IDs
   * @param {string} content - File content
   * @returns {string[]} Array of unique video IDs
   */
  parseContent(content) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    const lines = content.split('\n');
    const videoIds = [];
    const processedVideoIds = new Set();

    const parsingStatistics = {
      totalLines: 0,
      blankLines: 0,
      commentLines: 0,
      validUrls: 0,
      invalidUrls: 0,
      duplicates: 0
    };

    for (const line of lines) {
      parsingStatistics.totalLines++;

      if (videoIds.length >= URLParser.MAX_URL_COUNT) {
        console.warn(
          `[URLParser] Maximum URL count (${URLParser.MAX_URL_COUNT}) reached. ` +
          `Remaining lines will be ignored.`
        );
        break;
      }

      const trimmedLine = line.trim();

      if (trimmedLine === '') {
        parsingStatistics.blankLines++;
        continue;
      }

      if (trimmedLine.startsWith('#')) {
        parsingStatistics.commentLines++;
        continue;
      }

      const videoId = this.extractVideoIdFromLine(trimmedLine);

      if (!videoId) {
        parsingStatistics.invalidUrls++;
        continue;
      }

      if (processedVideoIds.has(videoId)) {
        parsingStatistics.duplicates++;
        console.log(`[URLParser] Duplicate: ${videoId}`);
        continue;
      }

      parsingStatistics.validUrls++;
      processedVideoIds.add(videoId);
      videoIds.push(videoId);
    }

    this.logStatistics(parsingStatistics, videoIds.length);
    return videoIds;
  }

  /**
   * Sanitizes input line
   * @param {string} line - Line to sanitize
   * @returns {string|null} Sanitized line or null
   */
  sanitizeLine(line) {
    const sanitized = ValidationHelpers.sanitizeString(line, URLParser.MAX_LINE_LENGTH);

    if (!sanitized) {
      return null;
    }

    if (sanitized.startsWith('#')) {
      return null;
    }

    if (line.length > URLParser.MAX_LINE_LENGTH) {
      console.warn(`[URLParser] Line truncated to ${URLParser.MAX_LINE_LENGTH} characters`);
    }

    return sanitized;
  }

  /**
   * Extracts video ID from line
   * @param {string} line - Line to parse
   * @returns {string|null} Video ID or null
   */
  extractVideoIdFromLine(line) {
    const sanitizedUrl = this.sanitizeLine(line);

    if (!sanitizedUrl) {
      return null;
    }

    if (!this.isValidScheme(sanitizedUrl)) {
      console.warn(`[URLParser] Skipping URL with invalid scheme: ${sanitizedUrl.substring(0, 100)}`);
      return null;
    }

    return this.matchYoutubePattern(sanitizedUrl);
  }

  /**
   * Match YouTube pattern and extract video ID
   * @param {string} sanitizedUrl - Sanitized URL
   * @returns {string|null} Video ID or null
   */
  matchYoutubePattern(sanitizedUrl) {
    for (const pattern of URLValidator.YOUTUBE_URL_PATTERNS) {
      const videoId = this.attemptPatternMatch(pattern, sanitizedUrl);

      if (videoId) {
        return videoId;
      }
    }

    console.warn(`[URLParser] Skipping invalid YouTube URL: ${sanitizedUrl.substring(0, 100)}`);
    return null;
  }

  /**
   * Attempt to match pattern and validate extracted ID
   * @param {RegExp} pattern - Pattern to match
   * @param {string} url - URL to test
   * @returns {string|null} Valid video ID or null
   */
  attemptPatternMatch(pattern, url) {
    try {
      const match = url.match(pattern);

      if (!match || !match[1]) {
        return null;
      }

      const videoId = match[1];

      if (URLValidator.validateVideoId(videoId)) {
        return videoId;
      }

      console.warn(`[URLParser] Extracted ID failed validation: ${videoId}`);
      return null;

    } catch (error) {
      console.warn(`[URLParser] Regex error on line: ${error.message}`);
      return null;
    }
  }

  /**
   * Validates URL scheme
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid scheme
   */
  isValidScheme(url) {
    try {
      const testUrl = url.startsWith('//') ? `http:${url}` :
                      url.match(/^https?:\/\//) ? url : `http://${url}`;

      const parsed = new URL(testUrl);
      return URLParser.ALLOWED_SCHEMES.includes(parsed.protocol);
    } catch {
      return true;
    }
  }

  /**
   * Validates video ID format
   * @param {string} videoId - Video ID to validate
   * @returns {boolean} True if valid
   */
  validateVideoId(videoId) {
    return URLValidator.validateVideoId(videoId);
  }

  /**
   * Gets specific rejection reason for invalid video ID
   * @param {string} videoId - Video ID to check
   * @returns {string|null} Rejection reason or null if valid
   */
  getInvalidReason(videoId) {
    return URLValidator.getInvalidReason(videoId);
  }

  /**
   * Logs parsing statistics
   * @param {Object} parsingStatistics - Statistics object
   * @param {number} uniqueCount - Count of unique videos
   */
  logStatistics(parsingStatistics, uniqueCount) {
    console.log('[URLParser] Parsing complete:');
    console.log(`  Total lines: ${parsingStatistics.totalLines}`);
    console.log(`  Valid URLs: ${parsingStatistics.validUrls}`);
    console.log(`  Unique videos: ${uniqueCount}`);

    if (parsingStatistics.invalidUrls > 0) {
      console.log(`  Invalid URLs (skipped): ${parsingStatistics.invalidUrls}`);
    }

    if (parsingStatistics.duplicates > 0) {
      console.log(`  Duplicates (skipped): ${parsingStatistics.duplicates}`);
    }
  }
}

module.exports = URLParser;
