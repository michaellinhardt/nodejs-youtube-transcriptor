/**
 * URLValidator - YouTube URL and video ID validation
 *
 * Consolidated URL validation logic extracted from APIClient
 * and URLParser to eliminate duplication and improve consistency.
 */
class URLValidator {
  static MAX_URL_LENGTH = 2083;
  static VIDEO_ID_LENGTH = 11;
  static VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

  static YOUTUBE_URL_PATTERNS = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
  ];

  /**
   * Validate YouTube URL format
   * @param {string} url - URL to validate
   * @throws {Error} If URL is invalid
   */
  static validateYouTubeUrl(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      throw new Error('Video URL is required and must be non-empty string');
    }

    if (url.length > this.MAX_URL_LENGTH) {
      throw new Error(`Video URL exceeds maximum length (${this.MAX_URL_LENGTH} characters)`);
    }

    const youtubePattern = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//;
    if (!youtubePattern.test(url)) {
      const urlPreview = url.length > 100 ? url.substring(0, 100) + '...' : url;
      throw new Error(`Invalid YouTube URL format: ${urlPreview}`);
    }
  }

  /**
   * Extract video ID from YouTube URL
   * @param {string} url - YouTube URL
   * @returns {string} Video ID (may be partial if not found in patterns)
   */
  static extractVideoId(url) {
    for (const pattern of this.YOUTUBE_URL_PATTERNS) {
      const match = url.match(pattern);

      if (match && match[1]) {
        return match[1];
      }
    }

    return url;
  }

  /**
   * Validate video ID format
   * @param {string} videoId - Video ID to validate
   * @returns {boolean} True if valid video ID
   */
  static validateVideoId(videoId) {
    if (!videoId || typeof videoId !== 'string') {
      return false;
    }

    if (videoId.length !== this.VIDEO_ID_LENGTH) {
      return false;
    }

    if (!this.VIDEO_ID_PATTERN.test(videoId)) {
      return false;
    }

    return true;
  }

  /**
   * Get specific rejection reason for invalid video ID
   * @param {string} videoId - Video ID to check
   * @returns {string|null} Rejection reason or null if valid
   */
  static getInvalidReason(videoId) {
    if (!videoId || typeof videoId !== 'string') {
      return 'Video ID is not a string';
    }

    if (videoId.length !== this.VIDEO_ID_LENGTH) {
      return `Invalid length: ${videoId.length} (expected ${this.VIDEO_ID_LENGTH})`;
    }

    if (!this.VIDEO_ID_PATTERN.test(videoId)) {
      return 'Contains invalid characters (only alphanumeric, dash, underscore allowed)';
    }

    return null;
  }
}

module.exports = URLValidator;
