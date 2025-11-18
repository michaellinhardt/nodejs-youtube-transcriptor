/**
 * Result Factory
 * Standardizes result object structures across the application
 *
 * Provides type-safe factory methods for creating result objects
 */
class ResultFactory {
  /**
   * Create process video result object
   * @param {Object} data - Result data
   * @param {boolean} data.success - Processing success flag
   * @param {string} data.videoId - Video identifier
   * @param {boolean} data.cached - Whether transcript was cached
   * @param {boolean} data.linked - Whether link was created
   * @param {string|null} data.linkPath - Path to created link
   * @param {boolean} data.replaced - Whether existing link was replaced
   * @returns {Object} Standardized process video result
   */
  static createProcessVideoResult(data) {
    return {
      success: data.success || false,
      videoId: data.videoId,
      cached: data.cached || false,
      linked: data.linked || false,
      linkPath: data.linkPath || null,
      replaced: data.replaced || false,
    };
  }

  /**
   * Create empty batch results object
   * @returns {Object} Initialized batch results
   */
  static createEmptyBatchResults() {
    return {
      processed: 0,
      cached: 0,
      fetched: 0,
      linked: 0,
      failed: 0,
      errors: [],
    };
  }

  /**
   * Add batch error to results object
   * @param {Object} results - Results object to mutate
   * @param {string} url - Failed URL
   * @param {string} errorMessage - Error message
   */
  static addBatchError(results, url, errorMessage) {
    results.failed++;
    results.errors.push({
      url,
      error: errorMessage,
    });
  }
}

module.exports = ResultFactory;
