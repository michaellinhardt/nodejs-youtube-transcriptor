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
   */
  constructor(storageService, apiClient) {
    this.storage = storageService;
    this.api = apiClient;

    // Statistics tracking
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
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

    // YouTube video IDs are exactly 11 characters
    if (trimmedId.length !== 11 || !/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
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
      let exists = false;
      if (inRegistry) {
        const fileExists = await this.storage.transcriptExists(trimmedId);

        if (!fileExists) {
          console.warn(`[Cache] Registry entry exists but file missing for ${trimmedId} - will refetch`);
          exists = false;
        } else {
          exists = true;
        }
      }

      // Update statistics
      if (exists) {
        this.stats.cacheHits++;
        console.log(`[Cache] HIT for ${trimmedId} (${this.stats.cacheHits} total hits)`);
      } else {
        this.stats.cacheMisses++;
        console.log(`[Cache] MISS for ${trimmedId} (${this.stats.cacheMisses} total misses)`);
      }

      return exists;

    } catch (error) {
      // Cache check failure should not block processing
      console.error(`[Cache] Check failed for ${trimmedId}:`, error.message);
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
      console.log(`[Transcript] Using cached version for ${trimmedId}`);

      try {
        const text = await this.storage.readTranscript(trimmedId);

        // Validate cached content (readTranscript already checks empty, but defensive)
        if (!text || text.trim() === '') {
          console.warn(`[Transcript] Cached file empty for ${trimmedId} - refetching`);
          // Fall through to API fetch
        } else {
          return text.trim();
        }
      } catch (error) {
        // Cache read failure - refetch from API
        console.warn(`[Transcript] Cache read failed for ${trimmedId}: ${error.message} - refetching`);
        // Fall through to API fetch
      }
    }

    // Cache miss or invalid cache - fetch from API
    console.log(`[Transcript] Fetching from API for ${trimmedId}`);
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
    console.log(`[Transcript] Saving to storage: ${videoId}`);

    try {
      await this.storage.saveTranscript(videoId, text);
      console.log(`[Transcript] Saved successfully: ${videoId}`);
    } catch (error) {
      console.error(`[Transcript] Save failed for ${videoId}: ${error.message}`);
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
    console.log(`[Transcript] Registering in data.json: ${videoId}`);

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
        console.log(`[Transcript] Created registry entry for ${videoId}`);
      } else {
        // Existing entry - preserve date_added and links
        // No action needed for cache hit scenario
        console.log(`[Transcript] Registry entry already exists for ${videoId}`);
      }

      // Save updated registry atomically (TR-8, TR-16)
      await this.storage.saveRegistry(registry);
      console.log(`[Transcript] Registry updated for ${videoId}`);

    } catch (error) {
      console.error(`[Transcript] Registration failed for ${videoId}: ${error.message}`);
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

    console.log('\n=== Cache Performance ===');
    console.log(`Total requests: ${stats.total}`);
    console.log(`Cache hits: ${stats.hits}`);
    console.log(`Cache misses: ${stats.misses}`);
    console.log(`Hit rate: ${stats.hitRate}`);
    console.log(`API calls saved: ${stats.hits}`);
    console.log(`Elapsed time: ${stats.elapsedSeconds}s`);
    console.log('========================\n');
  }
}

module.exports = TranscriptService;
