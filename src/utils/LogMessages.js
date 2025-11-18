/**
 * Log Message Templates
 * Centralizes console log message formatting for consistency
 */
const LOG_MESSAGES = {
  CACHE_HIT: (videoId) => `[Cache] Hit: ${videoId}`,
  CACHE_MISS: (videoId) => `[Cache] MISS for ${videoId}`,
  CACHE_HIT_COUNT: (videoId, count) => `[Cache] HIT for ${videoId} (${count} total hits)`,
  CACHE_MISS_COUNT: (videoId, count) => `[Cache] MISS for ${videoId} (${count} total misses)`,
  CACHE_ORPHANED: (videoId) => `[Cache] Registry entry exists but file missing for ${videoId} - will refetch`,
  CACHE_CHECK_FAILED: (videoId) => `[Cache] Check failed for ${videoId}:`,

  TRANSCRIPT_USING_CACHED: (videoId) => `[Transcript] Using cached version for ${videoId}`,
  TRANSCRIPT_EMPTY_CACHED: (videoId) => `[Transcript] Cached file empty for ${videoId} - refetching`,
  TRANSCRIPT_READ_FAILED: (videoId) => `[Transcript] Cache read failed for ${videoId}:`,
  TRANSCRIPT_FETCHING: (videoId) => `[Transcript] Fetching from API for ${videoId}`,
  TRANSCRIPT_SAVING: (videoId) => `[Transcript] Saving to storage: ${videoId}`,
  TRANSCRIPT_SAVED: (videoId) => `[Transcript] Saved successfully: ${videoId}`,
  TRANSCRIPT_SAVE_FAILED: (videoId) => `[Transcript] Save failed for ${videoId}:`,
  TRANSCRIPT_REGISTERING: (videoId) => `[Transcript] Registering in data.json: ${videoId}`,
  TRANSCRIPT_REGISTERED: (videoId) => `[Transcript] Registry updated for ${videoId}`,
  TRANSCRIPT_ENTRY_CREATED: (videoId) => `[Transcript] Created registry entry for ${videoId}`,
  TRANSCRIPT_ENTRY_EXISTS: (videoId) => `[Transcript] Registry entry already exists for ${videoId}`,
  TRANSCRIPT_REGISTER_FAILED: (videoId) => `[Transcript] Registration failed for ${videoId}:`,

  FETCH_SAVED: (videoId) => `[Fetch] Saved: ${videoId}`,

  LINK_CREATED: (path) => `[Link] Created: ${path}`,

  PROCESS_START: (videoId, url) => `[Process] Processing ${videoId} from ${url}`,
  PROCESS_SUCCESS: (videoId, cached, linked) =>
    `[Process] Success ${videoId} - cached: ${cached}, linked: ${linked}`,
  PROCESS_FAILED: (url, errorMessage) => `[Process] Failed ${url}: ${errorMessage}`,
  PROCESS_NO_URLS: '[Process] No URLs to process',

  BATCH_START: (count) => `[Process] Starting batch processing for ${count} URLs`,
  BATCH_PROJECT_DIR: (dir) => `[Process] Project directory: ${dir}`
};

module.exports = { LOG_MESSAGES };
