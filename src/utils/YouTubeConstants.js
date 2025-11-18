/**
 * YouTube Constants
 * Defines YouTube video ID specifications and URL patterns
 *
 * Implements TR-5 URL parsing requirements
 */

// TR-5: YouTube video ID specification
const VIDEO_ID_LENGTH = 11;
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// TR-5: YouTube URL pattern matching
const YOUTUBE_URL_PATTERNS = {
  SHORT_LINK: /(?:youtu\.be\/)([^&\s?]+)/,
  WATCH_URL: /(?:youtube\.com\/watch\?v=)([^&\s]+)/,
  EMBED_URL: /(?:youtube\.com\/embed\/)([^&\s?]+)/,
  VIDEO_URL: /(?:youtube\.com\/v\/)([^&\s?]+)/
};

module.exports = {
  VIDEO_ID_LENGTH,
  VIDEO_ID_PATTERN,
  YOUTUBE_URL_PATTERNS
};
