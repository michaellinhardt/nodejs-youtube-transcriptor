/**
 * Performance Profiler Utility
 *
 * Development utility for measuring operation timing
 * Implements task 9.3.6 from deployment plan
 *
 * Note: This is a development/debugging tool
 * Use only when needed for performance optimization
 */

const { logger } = require('./Logger');

/**
 * Simple profiler for timing operations
 * @class Profiler
 */
class Profiler {
  constructor() {
    this.timers = new Map();
    this.enabled = process.env.NODE_ENV !== 'production' || process.env.PROFILE === 'true';
  }

  /**
   * Start timing operation
   * @param {string} label - Operation label
   */
  start(label) {
    if (!this.enabled) {
      return;
    }

    this.timers.set(label, {
      startTime: Date.now(),
      startHrTime: process.hrtime.bigint()
    });
  }

  /**
   * End timing and return duration
   * @param {string} label - Operation label
   * @returns {number|null} Duration in milliseconds
   */
  end(label) {
    if (!this.enabled) {
      return null;
    }

    const timer = this.timers.get(label);
    if (!timer) {
      logger.verbose(`Profiler: No timer found for ${label}`);
      return null;
    }

    const durationMs = Date.now() - timer.startTime;
    const durationNs = process.hrtime.bigint() - timer.startHrTime;

    this.timers.delete(label);

    return {
      ms: durationMs,
      ns: Number(durationNs),
      precise: (Number(durationNs) / 1_000_000).toFixed(3) // Convert to ms with precision
    };
  }

  /**
   * End timing and log result
   * @param {string} label - Operation label
   */
  log(label) {
    const duration = this.end(label);
    if (duration !== null) {
      logger.verbose(`[PROFILE] ${label}: ${duration.precise}ms`);
    }
  }

  /**
   * Measure async function execution
   * @param {string} label - Operation label
   * @param {Function} fn - Async function to measure
   * @returns {Promise<any>} Function result
   */
  async measure(label, fn) {
    if (!this.enabled) {
      return await fn();
    }

    this.start(label);
    try {
      const result = await fn();
      this.log(label);
      return result;
    } catch (error) {
      this.log(label);
      throw error;
    }
  }

  /**
   * Get all active timers (for debugging)
   * @returns {Array<string>} Active timer labels
   */
  getActiveTimers() {
    return Array.from(this.timers.keys());
  }

  /**
   * Clear all timers
   */
  clear() {
    this.timers.clear();
  }

  /**
   * Enable profiling
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable profiling
   */
  disable() {
    this.enabled = false;
  }
}

// Singleton instance
const profilerInstance = new Profiler();

/**
 * Memory usage snapshot
 * @returns {Object} Memory usage in MB
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: (usage.rss / 1024 / 1024).toFixed(2) + ' MB',
    heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
    heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
    external: (usage.external / 1024 / 1024).toFixed(2) + ' MB'
  };
}

/**
 * Log memory usage
 * @param {string} label - Label for memory snapshot
 */
function logMemoryUsage(label = 'Memory Usage') {
  const usage = getMemoryUsage();
  logger.verbose(`[MEMORY] ${label}:`, usage);
}

/**
 * Create performance benchmark for operation
 * Runs operation multiple times and returns statistics
 *
 * @param {string} label - Operation label
 * @param {Function} fn - Function to benchmark
 * @param {number} iterations - Number of iterations (default 10)
 * @returns {Promise<Object>} Benchmark statistics
 */
async function benchmark(label, fn, iterations = 10) {
  const durations = [];

  logger.verbose(`[BENCHMARK] Running ${label} (${iterations} iterations)`);

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    durations.push(durationMs);
  }

  durations.sort((a, b) => a - b);

  const stats = {
    iterations,
    min: durations[0].toFixed(3),
    max: durations[durations.length - 1].toFixed(3),
    median: durations[Math.floor(durations.length / 2)].toFixed(3),
    avg: (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(3),
    total: durations.reduce((a, b) => a + b, 0).toFixed(3)
  };

  logger.verbose(`[BENCHMARK] ${label} results:`, stats);

  return stats;
}

module.exports = {
  Profiler,
  profiler: profilerInstance,
  getMemoryUsage,
  logMemoryUsage,
  benchmark
};
