/**
 * Logger Utility
 *
 * Provides verbosity-aware logging with three levels:
 * - ERROR: Errors only (quiet mode)
 * - INFO: Normal operational output (default)
 * - VERBOSE: Detailed debug information
 *
 * Implements task 9.3.5 from deployment plan
 * Singleton pattern ensures global verbosity state consistency
 */

const LogLevel = {
  ERROR: 0,
  INFO: 1,
  VERBOSE: 2
};

/**
 * Logger class with verbosity control
 * @class Logger
 */
class Logger {
  /**
   * @param {number} level - Logging level (LogLevel.ERROR, INFO, or VERBOSE)
   */
  constructor(level = LogLevel.INFO) {
    this.level = level;
  }

  /**
   * Log error message (always shown)
   * Uses stderr for proper stream separation
   *
   * @param {string} message - Error message
   * @param {...any} args - Additional arguments
   */
  error(message, ...args) {
    if (this.level >= LogLevel.ERROR) {
      console.error(message, ...args);
    }
  }

  /**
   * Log info message (normal mode and verbose)
   * Uses stdout for standard output
   *
   * @param {string} message - Info message
   * @param {...any} args - Additional arguments
   */
  info(message, ...args) {
    if (this.level >= LogLevel.INFO) {
      console.log(message, ...args);
    }
  }

  /**
   * Log verbose message (verbose mode only)
   * Prefixed with [VERBOSE] for clarity
   *
   * @param {string} message - Verbose message
   * @param {...any} args - Additional arguments
   */
  verbose(message, ...args) {
    if (this.level >= LogLevel.VERBOSE) {
      console.log('[VERBOSE]', message, ...args);
    }
  }

  /**
   * Log debug data (verbose mode only)
   * Pretty-prints objects as JSON
   *
   * @param {any} data - Data to debug
   * @param {string} label - Optional label for debug output
   */
  debug(data, label = '') {
    if (this.level >= LogLevel.VERBOSE) {
      const prefix = label ? `[DEBUG: ${label}]` : '[DEBUG]';
      if (typeof data === 'object') {
        console.log(prefix, JSON.stringify(data, null, 2));
      } else {
        console.log(prefix, data);
      }
    }
  }

  /**
   * Get current verbosity level
   * @returns {number} Current log level
   */
  getLevel() {
    return this.level;
  }

  /**
   * Set verbosity level
   * @param {number} level - New log level
   */
  setLevel(level) {
    if (![LogLevel.ERROR, LogLevel.INFO, LogLevel.VERBOSE].includes(level)) {
      throw new Error(`Invalid log level: ${level}`);
    }
    this.level = level;
  }

  /**
   * Check if verbose mode enabled
   * @returns {boolean} True if verbose
   */
  isVerbose() {
    return this.level >= LogLevel.VERBOSE;
  }

  /**
   * Check if quiet mode enabled
   * @returns {boolean} True if quiet
   */
  isQuiet() {
    return this.level === LogLevel.ERROR;
  }
}

// Singleton instance
let loggerInstance = new Logger();

/**
 * Set global verbosity level
 * @param {number} level - Log level to set
 */
function setVerbosity(level) {
  loggerInstance.setLevel(level);
}

/**
 * Get singleton logger instance
 * @returns {Logger} Global logger instance
 */
function getLogger() {
  return loggerInstance;
}

/**
 * Reset logger to default state (for testing)
 */
function resetLogger() {
  loggerInstance = new Logger();
}

module.exports = {
  Logger,
  LogLevel,
  setVerbosity,
  getLogger,
  resetLogger,
  // Export singleton instance as default
  logger: loggerInstance
};
