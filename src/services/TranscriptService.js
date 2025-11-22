const path = require('path');
const validators = require('../utils/validators');
const LinkManager = require('./LinkManager');
const ConsoleFormatter = require('../utils/ConsoleFormatter');
const ResultFactory = require('../utils/ResultFactory');
const { LOG_MESSAGES } = require('../utils/LogMessages');
const {
  VIDEO_ID_LENGTH,
  VIDEO_ID_PATTERN,
  YOUTUBE_URL_PATTERNS,
} = require('../utils/YouTubeConstants');

/**
 * Transcript Service
 *
 * Orchestrates transcript acquisition with cache-first strategy
 * Implements FR-2.2, FR-2.3, FR-3.2, TR-6, TR-7, TR-25, BR-1
 *
 * @class TranscriptService
 */
class TranscriptService {
  /**
   * @param {StorageService} storageService - Storage layer dependency
   * @param {APIClient} apiClient - API integration dependency
   * @param {MetadataService} metadataService - Metadata collection dependency
   * @param {Object} pathResolver - Path resolution utility
   */
  constructor(storageService, apiClient, metadataService, pathResolver) {
    // Validate dependencies
    if (!storageService || !apiClient || !metadataService || !pathResolver) {
      throw new Error(
        'TranscriptService requires StorageService, APIClient, MetadataService, and PathResolver dependencies'
      );
    }

    // CRITICAL: Validate MetadataService instance has required methods
    if (typeof metadataService.fetchVideoMetadata !== 'function') {
      throw new Error('MetadataService must implement fetchVideoMetadata method');
    }

    if (typeof metadataService.formatTitle !== 'function') {
      throw new Error('MetadataService must implement formatTitle method');
    }

    this.storage = storageService;
    this.api = apiClient;
    this.metadata = metadataService; // NEW DEPENDENCY
    this.linkManager = new LinkManager(storageService, pathResolver);

    // Statistics tracking
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      linksCreated: 0,
      linksFailed: 0,
      metadataFailed: 0, // NEW STAT
      metadataFetchDuration: 0, // NEW: Track metadata fetch time separately
      transcriptFetchDuration: 0, // NEW: Track transcript fetch time
      startTime: null,
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
   * Register transcript in data.json (implements FR-3.2, TR-16, TR-24)
   * Creates or updates registry entry with metadata
   *
   * @param {string} videoId - YouTube video identifier
   * @param {Object} metadata - {channel, title} (optional for backward compatibility)
   * @returns {Promise<void>}
   * @throws {Error} If registry update fails
   */
  async registerTranscript(videoId, metadata) {
    console.log(LOG_MESSAGES.TRANSCRIPT_REGISTERING(videoId));

    try {
      // Load current registry
      const registry = await this.storage.loadRegistry();

      // UPDATED Task 11.1: Use YYMMDDTHHMM format instead of YYYY-MM-DD
      const { generateDateAdded } = require('../utils/dateUtils');
      const dateAdded = generateDateAdded();

      // Create or update entry
      if (!registry[videoId]) {
        // UPDATED Task 11.4: Removed links array from registry structure
        // New entry - initialize with date and metadata
        registry[videoId] = {
          date_added: dateAdded,
          channel: metadata && metadata.channel ? metadata.channel : '',
          title: metadata && metadata.title ? metadata.title : '',
        };

        console.log(LOG_MESSAGES.TRANSCRIPT_ENTRY_CREATED(videoId));
      } else {
        // Existing entry - update metadata if provided (metadata may change over time)
        if (metadata && metadata.channel && metadata.title) {
          registry[videoId].channel = metadata.channel;
          registry[videoId].title = metadata.title;
        }
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
    const hitRate = total > 0 ? ((this.stats.cacheHits / total) * 100).toFixed(1) : 0;

    // Calculate elapsed time if tracking started
    const elapsedMs = this.stats.startTime ? Date.now() - this.stats.startTime : 0;

    const elapsedSeconds = (elapsedMs / 1000).toFixed(1);

    return {
      hits: this.stats.cacheHits,
      misses: this.stats.cacheMisses,
      total: total,
      hitRate: `${hitRate}%`,
      elapsedSeconds: elapsedSeconds,
      elapsedMs: elapsedMs,
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
   * Fetch transcript and metadata in parallel
   * CRITICAL ENHANCEMENTS: Performance tracking, error isolation, timeout handling
   * Implements TR-25 parallel fetch workflow
   *
   * @param {string} videoId - YouTube video ID
   * @param {string} videoUrl - Full YouTube URL
   * @returns {Promise<{transcript: string, metadata: {channel, title}}>}
   */
  async _fetchTranscriptAndMetadata(videoId, videoUrl) {
    try {
      // CRITICAL: Track fetch duration for both operations
      const transcriptStartTime = Date.now();
      const metadataStartTime = Date.now();

      // Execute both fetches in parallel with individual timing
      const [transcriptResult, metadataResult] = await Promise.all([
        this.api.fetchTranscript(videoUrl).then((transcript) => {
          this.stats.transcriptFetchDuration += Date.now() - transcriptStartTime;
          return transcript;
        }),
        this.metadata
          .fetchVideoMetadata(videoId)
          .then((metadata) => {
            this.stats.metadataFetchDuration += Date.now() - metadataStartTime;
            return metadata;
          })
          .catch((error) => {
            // CRITICAL: Metadata fetch failures should never propagate
            // Already handled internally, but defensive catch
            this.stats.metadataFailed++;
            console.warn(`[TranscriptService] Metadata fetch error caught: ${error.message}`);
            return { channel: 'Unknown Channel', title: 'Unknown Title' };
          }),
      ]);

      // CRITICAL: Track metadata fallback usage
      if (
        metadataResult.channel === 'Unknown Channel' ||
        metadataResult.title === 'Unknown Title'
      ) {
        this.stats.metadataFailed++;
      }

      return { transcript: transcriptResult, metadata: metadataResult };
    } catch (error) {
      // If transcript fetch fails, propagate error (fatal)
      // This catch only triggers if transcript API fails
      console.error(
        `[TranscriptService] Transcript fetch failed for ${videoId}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Retrieve transcript from cache or API with metadata
   * Implements FR-2.2 cache priority, TR-25 parallel fetch
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
          // For cached transcripts, extract metadata from file header if present
          // Otherwise use fallback values (backward compatibility)
          const metadata = this._extractMetadataFromTranscript(transcript);
          return { transcript, metadata, wasCached: true };
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
    const { transcript, metadata } = await this._fetchTranscriptAndMetadata(videoId, videoUrl);
    await this.storage.saveTranscript(videoId, transcript, metadata);
    await this.registerTranscript(videoId, metadata);
    console.log(LOG_MESSAGES.FETCH_SAVED(videoId));

    return { transcript, metadata, wasCached: false };
  }

  /**
   * Extract metadata from transcript file header
   * @private
   * @param {string} transcript - Transcript content
   * @returns {Object} Metadata {channel, title}
   */
  _extractMetadataFromTranscript(transcript) {
    const lines = transcript.split('\n');
    let channel = 'Unknown Channel';
    let title = 'Unknown Title';

    for (const line of lines.slice(0, 10)) {
      // Check first 10 lines
      if (line.startsWith('Channel: ')) {
        channel = line.substring(9).trim();
      } else if (line.startsWith('Title: ')) {
        title = line.substring(7).trim();
      }
    }

    return { channel, title };
  }

  /**
   * Process video: fetch transcript and create symbolic link
   * Implements FR-2, FR-4, TR-7, TR-25 processing workflow with metadata
   *
   * Step 1: Cache check (FR-2.2, BR-1)
   * Step 2: Fetch from API if needed (FR-2.1, FR-2.2 parallel fetch)
   * Step 3: Persist immediately (FR-2.3, FR-9.1, FR-11 with metadata header)
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

    // Step 1-3: Get or fetch transcript with metadata
    const { wasCached, metadata } = await this._getOrFetchTranscript(videoId, videoUrl);

    // Step 4: Create link (metadata used for filename by LinkManager)
    const linkResult = await this.linkManager.createLink(videoId, absoluteProjectDir);
    console.log(LOG_MESSAGES.LINK_CREATED(linkResult.path));
    this.stats.linksCreated++;

    return ResultFactory.createProcessVideoResult({
      success: true,
      videoId,
      cached: wasCached,
      linked: linkResult.success,
      linkPath: linkResult.path,
      replaced: linkResult.replaced,
      metadata: metadata,
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
      'Links failed': this.stats.linksFailed,
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
      linked: result.linked,
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
