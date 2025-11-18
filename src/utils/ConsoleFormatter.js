/**
 * Console Formatter Utility
 * Provides consistent console output formatting across the application
 *
 * Implements clean code principles by centralizing output formatting logic
 */
class ConsoleFormatter {
  /**
   * Display formatted box with title and content
   * @param {string} title - Box title
   * @param {Object} content - Key-value pairs to display
   * @param {number} width - Box width in characters
   */
  static displayBox(title, content, width = 50) {
    // Guard: Validate inputs
    if (!title || typeof title !== 'string') {
      title = 'Unknown';
    }
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
      content = { error: 'Invalid content provided' };
    }
    if (typeof width !== 'number' || width < 10) {
      width = 50;
    }

    const separator = '='.repeat(width);
    console.log(`\n${separator}`);
    console.log(title.padEnd(width));
    console.log(separator);

    for (const [key, value] of Object.entries(content)) {
      // Guard: Handle null/undefined values
      const displayValue = (value === null || value === undefined) ? 'N/A' : value;
      console.log(`${key}: ${displayValue}`);
    }

    console.log(`${separator}\n`);
  }

  /**
   * Format cache statistics for display
   * @param {Object} stats - Cache statistics object
   * @returns {Object} Formatted statistics
   */
  static formatStats(stats) {
    // Guard: Validate stats object
    if (!stats || typeof stats !== 'object') {
      return {
        error: 'Invalid statistics data'
      };
    }

    return {
      'Total requests': stats.total ?? 0,
      'Cache hits': stats.hits ?? 0,
      'Cache misses': stats.misses ?? 0,
      'Hit rate': stats.hitRate ?? '0%',
      'Elapsed time': stats.elapsedSeconds ? `${stats.elapsedSeconds}s` : '0s'
    };
  }

  /**
   * Format batch processing results for display
   * @param {Object} results - Batch results object
   * @param {number} totalUrls - Total number of URLs processed
   * @returns {Object} Formatted results
   */
  static formatBatchResults(results, totalUrls) {
    // Guard: Validate results object
    if (!results || typeof results !== 'object') {
      return {
        error: 'Invalid results data'
      };
    }

    return {
      'Total URLs': totalUrls ?? 0,
      'Processed': results.processed ?? 0,
      'From cache': results.cached ?? 0,
      'Fetched new': results.fetched ?? 0,
      'Links created': results.linked ?? 0,
      'Failed': results.failed ?? 0
    };
  }
}

module.exports = ConsoleFormatter;
