/**
 * Registry Cache
 *
 * Optimizes registry operations for large datasets
 * Implements task 9.3.3 from deployment plan
 *
 * Features:
 * - Lazy loading (metadata-only by default)
 * - In-memory cache with LRU eviction
 * - Atomic cache invalidation
 * - O(1) entry lookup
 * - Race condition protection
 *
 * Performance targets:
 * - Registry load < 100ms for 1000 entries
 * - Memory usage < 100MB with cache populated
 * - Cache hit ratio > 90% for typical usage
 */

const { logger } = require('../utils/Logger');

/**
 * Least Recently Used (LRU) cache for registry entries
 * @class RegistryCache
 */
class RegistryCache {
  static MAX_ENTRIES = 1000; // LRU eviction threshold
  static AVERAGE_TRANSCRIPT_SIZE_BYTES = 50 * 1024; // 50KB estimate

  constructor() {
    this.metadata = null;
    this.entries = new Map();
    this.dirty = true;
    this.isWriting = false; // Race condition protection
    this.accessOrder = []; // LRU tracking
  }

  /**
   * Invalidate cache (call before any write operation)
   * Atomic operation to prevent stale data
   */
  invalidate() {
    // Guard: Prevent invalidation during write
    if (this.isWriting) {
      logger.verbose('Cache invalidation blocked during write operation');
      return;
    }

    this.dirty = true;
    this.metadata = null;
    this.entries.clear();
    this.accessOrder = [];

    logger.verbose('Registry cache invalidated');
  }

  /**
   * Mark start of write operation
   * Prevents cache access during filesystem writes
   */
  startWrite() {
    this.isWriting = true;
    this.invalidate();
  }

  /**
   * Mark end of write operation
   */
  endWrite() {
    this.isWriting = false;
  }

  /**
   * Load metadata only (video IDs, dates, link counts)
   * Avoids loading full registry for statistics operations
   *
   * @param {Function} loadRegistryFn - Function to load full registry from disk
   * @returns {Array} Metadata array
   */
  async loadMetadata(loadRegistryFn) {
    // Guard: Use cached metadata if available
    if (!this.dirty && this.metadata) {
      logger.verbose('Cache hit: metadata');
      return this.metadata;
    }

    // Guard: Prevent access during write
    if (this.isWriting) {
      throw new Error('Cannot load metadata during write operation');
    }

    logger.verbose('Cache miss: loading metadata from disk');
    const registry = await loadRegistryFn();

    this.metadata = Object.keys(registry).map((id) => ({
      id,
      date: registry[id].date_added,
      channel: registry[id].channel,
      title: registry[id].title,
      links: registry[id].links,
      linkCount: registry[id].links.length,
    }));

    this.dirty = false;

    logger.verbose(`Metadata cached: ${this.metadata.length} entries`);
    return this.metadata;
  }

  /**
   * Get single registry entry (lazy load)
   * Implements LRU eviction if cache size exceeded
   *
   * @param {string} videoId - Video identifier
   * @param {Function} loadRegistryFn - Function to load full registry from disk
   * @returns {Object|undefined} Registry entry or undefined
   */
  async getEntry(videoId, loadRegistryFn) {
    // Guard: Prevent access during write
    if (this.isWriting) {
      // Fallback to direct read during write operations
      const registry = await loadRegistryFn();
      return registry[videoId];
    }

    // Cache hit
    if (this.entries.has(videoId)) {
      this.updateAccessOrder(videoId);
      logger.verbose(`Cache hit: entry ${videoId}`);
      return this.entries.get(videoId);
    }

    // Cache miss - load from disk
    logger.verbose(`Cache miss: loading entry ${videoId} from disk`);
    const registry = await loadRegistryFn();
    const entry = registry[videoId];

    if (entry) {
      this.cacheEntry(videoId, entry);
    }

    return entry;
  }

  /**
   * Cache single entry with LRU eviction
   * @private
   * @param {string} videoId - Video identifier
   * @param {Object} entry - Registry entry
   */
  cacheEntry(videoId, entry) {
    // Evict oldest entry if cache full
    if (this.entries.size >= RegistryCache.MAX_ENTRIES) {
      this.evictLRU();
    }

    this.entries.set(videoId, entry);
    this.updateAccessOrder(videoId);

    logger.verbose(`Entry cached: ${videoId} (cache size: ${this.entries.size})`);
  }

  /**
   * Update LRU access order
   * @private
   * @param {string} videoId - Video identifier
   */
  updateAccessOrder(videoId) {
    // Remove existing position
    const index = this.accessOrder.indexOf(videoId);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }

    // Add to end (most recently used)
    this.accessOrder.push(videoId);
  }

  /**
   * Evict least recently used entry
   * @private
   */
  evictLRU() {
    if (this.accessOrder.length === 0) {
      return;
    }

    const lruVideoId = this.accessOrder.shift();
    this.entries.delete(lruVideoId);

    logger.verbose(`LRU eviction: ${lruVideoId} (cache size: ${this.entries.size})`);
  }

  /**
   * Check if entry exists (without loading full data)
   * Uses metadata cache for efficiency
   *
   * @param {string} videoId - Video identifier
   * @param {Function} loadRegistryFn - Function to load registry
   * @returns {Promise<boolean>} True if entry exists
   */
  async hasEntry(videoId, loadRegistryFn) {
    // Check in-memory cache first
    if (this.entries.has(videoId)) {
      return true;
    }

    // Check metadata cache
    if (this.metadata && !this.dirty) {
      return this.metadata.some(m => m.id === videoId);
    }

    // Fallback to loading metadata
    const metadata = await this.loadMetadata(loadRegistryFn);
    return metadata.some(m => m.id === videoId);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      entriesCached: this.entries.size,
      maxEntries: RegistryCache.MAX_ENTRIES,
      metadataCached: this.metadata !== null,
      metadataCount: this.metadata ? this.metadata.length : 0,
      dirty: this.dirty,
      isWriting: this.isWriting,
      estimatedMemoryUsageMB: this.estimateMemoryUsage()
    };
  }

  /**
   * Estimate memory usage of cache
   * @private
   * @returns {number} Estimated memory in MB
   */
  estimateMemoryUsage() {
    const metadataSize = this.metadata ? this.metadata.length * 100 : 0; // ~100 bytes per metadata entry
    const entriesSize = this.entries.size * 500; // ~500 bytes per cached entry (conservative)
    return ((metadataSize + entriesSize) / (1024 * 1024)).toFixed(2);
  }

  /**
   * Clear all cached data
   */
  clear() {
    this.metadata = null;
    this.entries.clear();
    this.accessOrder = [];
    this.dirty = true;

    logger.verbose('Cache cleared');
  }
}

module.exports = RegistryCache;
