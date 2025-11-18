/**
 * Progress Indicator Utility
 *
 * Displays real-time progress bars for batch operations
 * Implements task 9.3.4 from deployment plan
 *
 * Features:
 * - Percentage-based progress bar
 * - Time estimation (remaining)
 * - TTY detection (disables in non-interactive mode)
 * - Throttled updates (max 10/sec for performance)
 * - Cross-platform terminal support
 */

const { logger } = require('./Logger');

/**
 * Progress Indicator with visual feedback
 * @class ProgressIndicator
 */
class ProgressIndicator {
  static BAR_WIDTH = 50; // Characters in progress bar
  static UPDATE_THROTTLE_MS = 100; // Min time between updates (10/sec)

  /**
   * @param {number} total - Total items to process
   * @param {string} label - Progress bar label
   */
  constructor(total, label = 'Processing') {
    this.total = total;
    this.current = 0;
    this.label = label;
    this.startTime = Date.now();
    this.lastUpdateTime = 0;
    this.enabled = this.shouldEnable();
  }

  /**
   * Determine if progress bar should be enabled
   * Disables for non-TTY (pipes, redirects) and quiet mode
   *
   * @returns {boolean} True if should show progress
   */
  shouldEnable() {
    // Disable if output redirected
    if (!process.stdout.isTTY) {
      return false;
    }

    // Disable in quiet mode
    if (logger.isQuiet()) {
      return false;
    }

    // Disable if zero items (prevent division by zero)
    if (this.total === 0) {
      return false;
    }

    return true;
  }

  /**
   * Update progress to current item
   * Throttled to prevent terminal slowdown
   *
   * @param {number} current - Current item count
   * @param {string} itemLabel - Label for current item
   */
  update(current, itemLabel = '') {
    if (!this.enabled) {
      return;
    }

    this.current = current;

    // Throttle updates
    const now = Date.now();
    if (now - this.lastUpdateTime < ProgressIndicator.UPDATE_THROTTLE_MS) {
      return;
    }
    this.lastUpdateTime = now;

    try {
      this.render(itemLabel);
    } catch (error) {
      // Disable on render error (e.g., terminal resize)
      this.enabled = false;
      logger.verbose('Progress bar disabled due to render error:', error.message);
    }
  }

  /**
   * Render progress bar to terminal
   * @private
   * @param {string} itemLabel - Current item label
   */
  render(itemLabel) {
    const percent = Math.floor((this.current / this.total) * 100);
    const bar = this.generateBar(percent);
    const timeRemaining = this.estimateTimeRemaining();

    // Clear line and write progress
    process.stdout.write('\r\x1b[K');
    process.stdout.write(
      `${this.label}: [${bar}] ${percent}% ` +
      `(${this.current}/${this.total})` +
      (itemLabel ? ` ${itemLabel}` : '') +
      (timeRemaining !== null ? ` - ${timeRemaining}s remaining` : '')
    );
  }

  /**
   * Generate ASCII progress bar
   * @private
   * @param {number} percent - Completion percentage
   * @returns {string} Progress bar string
   */
  generateBar(percent) {
    const filled = Math.floor((percent / 100) * ProgressIndicator.BAR_WIDTH);
    const empty = ProgressIndicator.BAR_WIDTH - filled;
    return '='.repeat(filled) + ' '.repeat(empty);
  }

  /**
   * Estimate time remaining based on current progress
   * Uses average time per item
   * @private
   * @returns {number|null} Seconds remaining or null if cannot estimate
   */
  estimateTimeRemaining() {
    if (this.current === 0) {
      return null;
    }

    const elapsed = Date.now() - this.startTime;
    const avgTimePerItem = elapsed / this.current;
    const remainingItems = this.total - this.current;
    const remainingMs = remainingItems * avgTimePerItem;

    return Math.floor(remainingMs / 1000);
  }

  /**
   * Mark progress as complete and show summary
   */
  complete() {
    if (!this.enabled) {
      return;
    }

    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);

    // Final 100% bar
    this.current = this.total;
    this.render('');

    // New line and completion message
    console.log(`\n${this.label} complete: ${this.total} items in ${duration}s`);
  }

  /**
   * Clear progress bar (useful for interruption)
   */
  clear() {
    if (!this.enabled || !process.stdout.isTTY) {
      return;
    }

    process.stdout.write('\r\x1b[K');
  }

  /**
   * Increment progress by one
   * @param {string} itemLabel - Label for current item
   */
  increment(itemLabel = '') {
    this.update(this.current + 1, itemLabel);
  }
}

/**
 * Create simple spinner for indeterminate operations
 * @class Spinner
 */
class Spinner {
  static FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  static FRAME_INTERVAL_MS = 80;

  /**
   * @param {string} message - Spinner message
   */
  constructor(message = 'Loading') {
    this.message = message;
    this.frameIndex = 0;
    this.intervalId = null;
    this.enabled = process.stdout.isTTY && !logger.isQuiet();
  }

  /**
   * Start spinning
   */
  start() {
    if (!this.enabled) {
      return;
    }

    this.intervalId = setInterval(() => {
      this.render();
      this.frameIndex = (this.frameIndex + 1) % Spinner.FRAMES.length;
    }, Spinner.FRAME_INTERVAL_MS);
  }

  /**
   * Render current spinner frame
   * @private
   */
  render() {
    const frame = Spinner.FRAMES[this.frameIndex];
    process.stdout.write(`\r\x1b[K${frame} ${this.message}`);
  }

  /**
   * Stop spinning and clear
   * @param {string} finalMessage - Optional completion message
   */
  stop(finalMessage = null) {
    if (!this.enabled) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    process.stdout.write('\r\x1b[K');

    if (finalMessage) {
      console.log(finalMessage);
    }
  }

  /**
   * Update spinner message while running
   * @param {string} message - New message
   */
  updateMessage(message) {
    this.message = message;
  }
}

module.exports = {
  ProgressIndicator,
  Spinner
};
