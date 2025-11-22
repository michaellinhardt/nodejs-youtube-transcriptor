const axios = require('axios');
const { VIDEO_ID_PATTERN, VIDEO_ID_LENGTH } = require('../utils/YouTubeConstants');

/**
 * Metadata Service
 *
 * Fetches video metadata from YouTube oEmbed API and provides utilities
 * for title formatting and URL generation.
 * Implements FR-2.2, FR-2.5, FR-3.3, TR-20, TR-21, TR-22, TR-26, TR-28
 *
 * @class MetadataService
 */
class MetadataService {
  constructor() {
    this.client = axios.create({
      timeout: 15000, // 15s per TR-20
      headers: {
        'User-Agent': 'Transcriptor/1.0',
      },
    });

    this.OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';
    this.FALLBACK_CHANNEL = 'Unknown Channel';
    this.FALLBACK_TITLE = 'Unknown Title';
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY_MS = 1000; // Exponential backoff base
  }

  /**
   * Fetch video metadata from YouTube oEmbed API with retry logic
   * Implements TR-20 metadata acquisition with fallback values
   *
   * @param {string} videoId - YouTube video ID (11 chars)
   * @returns {Promise<{channel: string, title: string}>}
   */
  async fetchVideoMetadata(videoId) {
    // CRITICAL: Validate videoId format first (prevent API abuse)
    if (!videoId || videoId.length !== VIDEO_ID_LENGTH || !VIDEO_ID_PATTERN.test(videoId)) {
      console.warn(`[MetadataService] Invalid video ID: ${videoId}`);
      return { channel: this.FALLBACK_CHANNEL, title: this.FALLBACK_TITLE };
    }

    // Retry loop for 503 errors
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const oembedUrl = `${this.OEMBED_ENDPOINT}?url=https://youtu.be/${videoId}&format=json`;
        const response = await this.client.get(oembedUrl);

        // CRITICAL: Validate response structure
        if (!response.data || typeof response.data !== 'object') {
          throw new Error('Invalid oEmbed response structure');
        }

        // CRITICAL: Validate fields not empty after trim
        const channel = response.data.author_name?.trim() || this.FALLBACK_CHANNEL;
        const title = response.data.title?.trim() || this.FALLBACK_TITLE;

        // CRITICAL: Validate no path separators or control characters
        const validatedMetadata = this.validateMetadata({ channel, title });

        return validatedMetadata;
      } catch (error) {
        // Handle retries for 503 only
        if (error.response?.status === 503 && attempt < this.MAX_RETRIES - 1) {
          const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[MetadataService] 503 error for ${videoId}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.MAX_RETRIES})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Log error with context and return fallback
        this.logMetadataError(videoId, error);
        return { channel: this.FALLBACK_CHANNEL, title: this.FALLBACK_TITLE };
      }
    }

    // All retries exhausted
    return { channel: this.FALLBACK_CHANNEL, title: this.FALLBACK_TITLE };
  }

  /**
   * Validate metadata fields for security and integrity
   * CRITICAL: Prevents path traversal and injection attacks
   *
   * @param {Object} metadata - {channel, title}
   * @returns {Object} Validated metadata
   */
  validateMetadata(metadata) {
    const { channel, title } = metadata;

    // Check for path separators and control characters only (not | which is safe in JSON)
    // Only block: / \ < > : " ? * and control chars (\x00-\x1F)
    const UNSAFE_PATTERN = /[\/\\<>:"?*\x00-\x1F]/;

    const safeChannel = UNSAFE_PATTERN.test(channel) ? 'Unknown Channel' : channel;

    const safeTitle = UNSAFE_PATTERN.test(title) ? 'Unknown Title' : title;

    return { channel: safeChannel, title: safeTitle };
  }

  /**
   * Log metadata fetch error with context
   * Implements TR-29 error handling
   *
   * @param {string} videoId - Video ID
   * @param {Error} error - Error object
   */
  logMetadataError(videoId, error) {
    const timestamp = new Date().toISOString();
    const status = error.response?.status || 'N/A';
    const message = error.message || 'Unknown error';

    if (error.response) {
      console.warn(
        `[${timestamp}] Metadata fetch failed for ${videoId}: HTTP ${status} - ${message}`
      );
    } else if (error.code === 'ECONNABORTED') {
      console.warn(`[${timestamp}] Metadata fetch timeout for ${videoId} (>15s)`);
    } else {
      console.warn(`[${timestamp}] Metadata fetch error for ${videoId}: ${message}`);
    }
  }

  /**
   * Format title for filesystem safety
   * CRITICAL: Unicode normalization added for proper emoji/unicode handling
   * Implements FR-2.5, TR-21, TR-26 title sanitization
   *
   * @param {string} title - Original video title
   * @returns {string} Sanitized title (lowercase, underscores, alphanumeric+dash only)
   */
  formatTitle(title) {
    // Guard: Handle null/undefined/non-string
    if (!title || typeof title !== 'string') {
      return 'untitled';
    }

    let formatted = title.trim();

    // Guard: Empty after trim
    if (formatted === '') {
      return 'untitled';
    }

    // CRITICAL: Normalize unicode (handles emoji, accented chars)
    formatted = formatted.normalize('NFKD');

    // Transform to lowercase
    formatted = formatted.toLowerCase();

    // Replace whitespace sequences with single underscore
    formatted = formatted.replace(/\s+/g, '_');

    // Remove all characters except a-z, 0-9, underscore, dash
    formatted = formatted.replace(/[^a-z0-9_-]+/g, '_');

    // Collapse consecutive underscores to single
    formatted = formatted.replace(/_+/g, '_');

    // Remove leading and trailing underscores
    formatted = formatted.replace(/^_|_$/g, '');

    // Truncate to 100 chars for filesystem safety
    if (formatted.length > 100) {
      formatted = formatted.substring(0, 100);
      // Re-remove trailing underscore if truncation created one
      formatted = formatted.replace(/_$/g, '');
    }

    // Final guard: Empty result means all characters were invalid
    if (formatted === '') {
      return 'untitled';
    }

    return formatted;
  }

  /**
   * Build standardized YouTube short URL
   * Implements FR-3.3, TR-22, TR-28 URL generation
   *
   * @param {string} videoId - YouTube video ID
   * @returns {string} Short URL format: https://youtu.be/{videoId}
   */
  buildShortUrl(videoId) {
    // Validate videoId format (11 chars, alphanumeric + dash/underscore)
    if (!videoId || typeof videoId !== 'string' || videoId.length !== VIDEO_ID_LENGTH) {
      throw new Error(`Invalid video ID for URL generation: ${videoId}`);
    }

    if (!VIDEO_ID_PATTERN.test(videoId)) {
      throw new Error(`Video ID contains invalid characters: ${videoId}`);
    }

    return `https://youtu.be/${videoId}`;
  }
}

module.exports = MetadataService;
