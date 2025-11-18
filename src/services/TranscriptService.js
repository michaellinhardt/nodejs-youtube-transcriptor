const path = require('path');
const validators = require('../utils/validators');
const LinkManager = require('./LinkManager');
const ConsoleFormatter = require('../utils/ConsoleFormatter');
const ResultFactory = require('../utils/ResultFactory');
const { LOG_MESSAGES } = require('../utils/LogMessages');
const { VIDEO_ID_LENGTH, VIDEO_ID_PATTERN, YOUTUBE_URL_PATTERNS } = require('../utils/YouTubeConstants');

/**
 * Transcript Service
 *
 * Orchestrates transcript acquisition with cache-first strategy
 * Implements FR-2.2, FR-2.3, FR-3.2, TR-6, TR-7, BR-1
 *
 * @class TranscriptService
 */
class TranscriptService {
  /**
   * @param {StorageService} storageService - Storage layer dependency
   * @param {APIClient} apiClient - API integration dependency
   * @param {Object} pathResolver - Path resolution utility
   */
  constructor(storageService, apiClient, pathResolver) {
    // Validate dependencies
    if (!storageService || !apiClient || !pathResolver) {
      throw new Error('TranscriptService requires StorageService, APIClient, and PathResolver dependencies');
    }

    this.storage = storageService;
    this.api = apiClient;
    this.linkManager = new LinkManager(storageService, pathResolver);

    // Statistics tracking
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      linksCreated: 0,
      linksFailed: 0,
      startTime: null
    };
  }

  /**
   * Check if transcript exists in cache (registry and file)
   * Implements FR-2.2 cache checking, TR-6 algorithm
   * Enhanced: Verifies both registry entry AND file existence for coherence
   *
   * @param {string} videoId - YouTube video identifier (11 chars, alphanumeric+dash)
   * @returns {Promise<boolean>} True if transcript cached, false if needs fetch
   * @throws {Error} If videoId format invalid
   */
  async isCached(videoId) {
    // Validate input format (11-char YouTube ID)
    if (!videoId || typeof videoId !== 'string' || videoId.trim() === '') {
      throw new Error('Video ID required for cache check');
    }

    const trimmedId = videoId.trim();

    // TR-5: YouTube video IDs must match specification
    if (trimmedId.length !== VIDEO_ID_LENGTH || !VIDEO_ID_PATTERN.test(trimmedId)) {
      throw new Error(`Invalid YouTube video ID format: ${trimmedId}`);
    }

    // Start timer on first cache check
    if (this.stats.startTime === null) {
      this.stats.startTime = Date.now();
    }

    try {
      // Load current registry state
      const registry = await this.storage.loadRegistry();

      // Check existence in registry (prototype-safe)
      const inRegistry = Object.prototype.hasOwnProperty.call(registry, trimmedId);

      // ENHANCEMENT: Verify file actually exists (detect orphaned registry entries)
      let isCachedAndValid = false;
      if (inRegistry) {
        const transcriptFileExists = await this.storage.transcriptExists(trimmedId);

        if (!transcriptFileExists) {
          console.warn(LOG_MESSAGES.CACHE_ORPHANED(trimmedId));
          isCachedAndValid = false;
        } else {
          isCachedAndValid = true;
        }
      }

      // Update statistics
      if (isCachedAndValid) {
        this.stats.cacheHits++;
        console.log(LOG_MESSAGES.CACHE_HIT_COUNT(trimmedId, this.stats.cacheHits));
      } else {
        this.stats.cacheMisses++;
        console.log(LOG_MESSAGES.CACHE_MISS_COUNT(trimmedId, this.stats.cacheMisses));
      }

      return isCachedAndValid;

    } catch (error) {
      // Cache check failure should not block processing
      console.error(LOG_MESSAGES.CACHE_CHECK_FAILED(trimmedId), error.message);
      // Conservative approach: assume not cached to trigger fetch
      return false;
    }
  }

  /**
   * Get transcript with cache-first strategy
   * Implements FR-2.2 cache priority, BR-1 cache-first rule
   *
   * @param {string} videoId - YouTube video identifier
   * @param {string} videoUrl - Full YouTube URL (for API if needed)
   * @returns {Promise<string>} Transcript text
   * @throws {Error} On storage or API failures
   */
  async getTranscript(videoId, videoUrl) {
    // Validate inputs
    if (!videoId || typeof videoId !== 'string' || videoId.trim() === '') {
      throw new Error('Video ID required and must be non-empty string');
    }

    if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.trim() === '') {
      throw new Error('Video URL required and must be non-empty string');
    }

    const trimmedId = videoId.trim();
    const trimmedUrl = videoUrl.trim();

    // Check cache first (BR-1)
    const cached = await this.isCached(trimmedId);

    if (cached) {
      // Retrieve from central storage
      console.log(LOG_MESSAGES.TRANSCRIPT_USING_CACHED(trimmedId));

      try {
        const text = await this.storage.readTranscript(trimmedId);

        // Validate cached content (readTranscript already checks empty, but defensive)
        if (!text || text.trim() === '') {
          console.warn(LOG_MESSAGES.TRANSCRIPT_EMPTY_CACHED(trimmedId));
          // Fall through to API fetch
        } else {
          return text.trim();
        }
      } catch (error) {
        // Cache read failure - refetch from API
        console.warn(LOG_MESSAGES.TRANSCRIPT_READ_FAILED(trimmedId), error.message, '- refetching');
        // Fall through to API fetch
      }
    }

    // Cache miss or invalid cache - fetch from API
    console.log(LOG_MESSAGES.TRANSCRIPT_FETCHING(trimmedId));
    const text = await this.api.fetchTranscript(trimmedUrl);

    // Persist immediately per FR-2.3
    await this.saveTranscript(trimmedId, text);
    await this.registerTranscript(trimmedId);

    return text;
  }

  /**
   * Save transcript to central storage (implements FR-2.3, TR-17)
   * Wrapper around StorageService with logging
   *
   * @param {string} videoId - YouTube video identifier
   * @param {string} text - Transcript content
   * @returns {Promise<void>}
   * @throws {Error} If save fails
   */
  async saveTranscript(videoId, text) {
    console.log(LOG_MESSAGES.TRANSCRIPT_SAVING(videoId));

    try {
      await this.storage.saveTranscript(videoId, text);
      console.log(LOG_MESSAGES.TRANSCRIPT_SAVED(videoId));
    } catch (error) {
      console.error(LOG_MESSAGES.TRANSCRIPT_SAVE_FAILED(videoId), error.message);
      throw new Error(`Failed to save transcript ${videoId}: ${error.message}`);
    }
  }

  /**
   * Register transcript in data.json (implements FR-3.2, TR-16)
   * Creates or updates registry entry with metadata
   *
   * @param {string} videoId - YouTube video identifier
   * @returns {Promise<void>}
   * @throws {Error} If registry update fails
   */
  async registerTranscript(videoId) {
    console.log(LOG_MESSAGES.TRANSCRIPT_REGISTERING(videoId));

    try {
      // Load current registry
      const registry = await this.storage.loadRegistry();

      // Get current date in YYYY-MM-DD format (BR-4)
      const today = new Date();
      const dateAdded = today.toISOString().split('T')[0]; // YYYY-MM-DD

      // Create or update entry
      if (!registry[videoId]) {
        // New entry - initialize with date and empty links array
        registry[videoId] = {
          date_added: dateAdded,
          links: []
        };
        console.log(LOG_MESSAGES.TRANSCRIPT_ENTRY_CREATED(videoId));
      } else {
        // Existing entry - preserve date_added and links
        // No action needed for cache hit scenario
        console.log(LOG_MESSAGES.TRANSCRIPT_ENTRY_EXISTS(videoId));
      }

      // Save updated registry atomically (TR-8, TR-16)
      await this.storage.saveRegistry(registry);
      console.log(LOG_MESSAGES.TRANSCRIPT_REGISTERED(videoId));

    } catch (error) {
      console.error(LOG_MESSAGES.TRANSCRIPT_REGISTER_FAILED(videoId), error.message);
      throw new Error(`Failed to register transcript ${videoId}: ${error.message}`);
    }
  }

  /**
   * Get current cache statistics
   * @returns {Object} Cache performance metrics
   */
  getCacheStats() {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    const hitRate = total > 0
      ? ((this.stats.cacheHits / total) * 100).toFixed(1)
      : 0;

    // Calculate elapsed time if tracking started
    const elapsedMs = this.stats.startTime
      ? Date.now() - this.stats.startTime
      : 0;

    const elapsedSeconds = (elapsedMs / 1000).toFixed(1);

    return {
      hits: this.stats.cacheHits,
      misses: this.stats.cacheMisses,
      total: total,
      hitRate: `${hitRate}%`,
      elapsedSeconds: elapsedSeconds,
      elapsedMs: elapsedMs
    };
  }

  /**
   * Reset statistics for new processing run
   */
  resetStats() {
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
    this.stats.startTime = null;
  }

  /**
   * Display cache statistics summary
   * Call at end of processing run
   */
  displayCacheStats() {
    const stats = this.getCacheStats();
    const formatted = ConsoleFormatter.formatStats(stats);
    formatted['API calls saved'] = stats.hits;
    ConsoleFormatter.displayBox('Cache Performance', formatted);
  }

  /**
   * Retrieve transcript from cache or API
   * @private
   */
  async _getOrFetchTranscript(videoId, videoUrl) {
    const isCached = await this.isCached(videoId);

    // Guard: Return cached transcript if available
    if (isCached) {
      try {
        const transcript = await this.storage.readTranscript(videoId);

        // Defensive: Validate content not empty
        if (!transcript || transcript.trim() === '') {
          console.warn(LOG_MESSAGES.TRANSCRIPT_EMPTY_CACHED(videoId));
          // Fall through to API fetch
        } else {
          console.log(LOG_MESSAGES.CACHE_HIT(videoId));
          return { transcript, wasCached: true };
        }
      } catch (error) {
        // Cache read failure - log and refetch from API
        console.warn(LOG_MESSAGES.TRANSCRIPT_READ_FAILED(videoId), error.message, '- refetching');
        // Fall through to API fetch
      }
    }

    // Fetch from API when:
    // - Not cached (isCached = false)
    // - Cache read failed (caught exception)
    // - Cached file empty (validation failed)
    const transcript = await this.api.fetchTranscript(videoUrl);
    await this.storage.saveTranscript(videoId, transcript);
    await this.registerTranscript(videoId);
    console.log(LOG_MESSAGES.FETCH_SAVED(videoId));

    return { transcript, wasCached: false };
  }

  /**
   * Process video: fetch transcript and create symbolic link
   * Implements FR-2, FR-4, TR-7 processing workflow
   *
   * Step 1: Cache check (FR-2.2, BR-1)
   * Step 2: Fetch from API if needed (FR-2.1)
   * Step 3: Persist immediately (FR-2.3, FR-9.1)
   * Step 4: Create link (FR-4)
   *
   * @param {string} videoId - YouTube video identifier (11 chars)
   * @param {string} videoUrl - Full YouTube URL for API
   * @param {string} projectDir - Project directory for symlink (defaults to cwd)
   * @returns {Promise<Object>} Processing result with success, videoId, cached, linked flags
   * @throws {Error} If videoId invalid or transcript fetch fails
   */
  async processVideo(videoId, videoUrl, projectDir = process.cwd()) {
    // Validate inputs
    validators.assertValidVideoId(videoId);
    const absoluteProjectDir = path.resolve(projectDir);

    // Step 1-3: Get or fetch transcript
    const { transcript, wasCached } = await this._getOrFetchTranscript(videoId, videoUrl);

    // Step 4: Create link
    const linkResult = await this.linkManager.createLink(videoId, absoluteProjectDir);
    console.log(LOG_MESSAGES.LINK_CREATED(linkResult.path));
    this.stats.linksCreated++;

    return ResultFactory.createProcessVideoResult({
      success: true,
      videoId,
      cached: wasCached,
      linked: linkResult.success,
      linkPath: linkResult.path,
      replaced: linkResult.replaced
    });
  }

  /**
   * Display processing statistics summary
   * Includes cache performance and link creation metrics
   */
  displayStats() {
    const cacheStats = this.getCacheStats();
    const formatted = {
      ...ConsoleFormatter.formatStats(cacheStats),
      'Links created': this.stats.linksCreated,
      'Links failed': this.stats.linksFailed
    };
    ConsoleFormatter.displayBox('Processing Summary', formatted);
  }

  /**
   * Extract YouTube video ID from URL
   * Implements TR-5 URL parsing algorithm
   *
   * @param {string} url - YouTube URL (youtu.be or youtube.com format)
   * @returns {string} Video ID (11 chars)
   * @throws {Error} If URL invalid or videoId cannot be extracted
   */
  extractVideoId(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      throw new Error('URL required and must be non-empty string');
    }

    const trimmedUrl = url.trim();

    // TR-5: YouTube URL pattern matching
    const patterns = Object.values(YOUTUBE_URL_PATTERNS);

    for (const pattern of patterns) {
      const match = trimmedUrl.match(pattern);
      if (match && match[1]) {
        const videoId = match[1];

        // TR-5: Validate format per YouTube specification
        if (videoId.length === VIDEO_ID_LENGTH && VIDEO_ID_PATTERN.test(videoId)) {
          return videoId;
        }
      }
    }

    throw new Error(
      `Unable to extract valid YouTube video ID from URL: ${trimmedUrl}. ` +
      `Expected ${VIDEO_ID_LENGTH}-character ID matching pattern ${VIDEO_ID_PATTERN}`
    );
  }

  /**
   * Process single URL in batch context
   * @private
   */
  async _processSingleUrl(url, projectDir) {
    const videoId = this.extractVideoId(url);
    console.log(LOG_MESSAGES.PROCESS_START(videoId, url));

    const wasCached = await this.isCached(videoId);
    const result = await this.processVideo(videoId, url, projectDir);

    console.log(LOG_MESSAGES.PROCESS_SUCCESS(videoId, wasCached, result.linked));

    return {
      success: true,
      wasCached,
      linked: result.linked
    };
  }

  /**
   * Aggregate single URL result into batch results
   * @private
   */
  _aggregateBatchResult(results, urlResult) {
    results.processed++;

    if (urlResult.wasCached) {
      results.cached++;
    } else {
      results.fetched++;
    }

    if (urlResult.linked) {
      results.linked++;
    }
  }

  /**
   * Display batch processing summary
   * @private
   */
  _displayBatchSummary(totalUrls, results) {
    const formatted = ConsoleFormatter.formatBatchResults(results, totalUrls);
    ConsoleFormatter.displayBox('Batch Processing Complete', formatted);

    if (results.errors.length > 0) {
      console.log('Errors:');
      results.errors.forEach((errorEntry, errorIndex) => {
        const errorNumber = errorIndex + 1;
        console.log(`  ${errorNumber}. ${errorEntry.url}`);
        console.log(`     ${errorEntry.error}`);
      });
      console.log();
    }
  }

  /**
   * Process multiple video URLs from input file
   * Implements FR-1.1, FR-2.3, TR-7 complete workflow
   *
   * @param {string[]} videoUrls - Array of YouTube URLs
   * @param {string} projectDir - Target directory for links (defaults to cwd)
   * @returns {Promise<Object>} Batch results with success/failure counts
   */
  async processBatch(videoUrls, projectDir = process.cwd()) {
    // Guard: Validate inputs
    if (!Array.isArray(videoUrls)) {
      throw new Error('videoUrls must be an array');
    }

    if (videoUrls.length === 0) {
      console.log(LOG_MESSAGES.PROCESS_NO_URLS);
      return ResultFactory.createEmptyBatchResults();
    }

    const results = ResultFactory.createEmptyBatchResults();
    const absoluteProjectDir = path.resolve(projectDir);

    console.log(LOG_MESSAGES.BATCH_START(videoUrls.length));
    console.log(LOG_MESSAGES.BATCH_PROJECT_DIR(absoluteProjectDir));

    // Sequential processing per BR-2
    for (const url of videoUrls) {
      try {
        const urlResult = await this._processSingleUrl(url, absoluteProjectDir);
        this._aggregateBatchResult(results, urlResult);
      } catch (error) {
        ResultFactory.addBatchError(results, url, error.message);
        console.error(LOG_MESSAGES.PROCESS_FAILED(url, error.message));
      }
    }

    this._displayBatchSummary(videoUrls.length, results);

    return results;
  }
}

module.exports = TranscriptService;
