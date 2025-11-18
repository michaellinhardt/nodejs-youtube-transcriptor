/**
 * Transcript Service
 *
 * Orchestrates transcript processing workflow implementing FR-2
 * Coordinates between storage and API services
 *
 * @class TranscriptService
 */
class TranscriptService {
  /**
   * @param {StorageService} storageService - Storage service instance
   * @param {APIClient} apiClient - API client instance
   */
  constructor(storageService, apiClient) {
    this.storage = storageService;
    this.api = apiClient;
  }

  /**
   * Process video transcript (implements FR-2.3, TR-7)
   *
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<void>}
   * @throws {Error} Not yet implemented
   */
  async processVideo(videoId) {
    throw new Error('TranscriptService.processVideo not yet implemented');
    // Future implementation:
    // 1. Check cache via storage.checkCache(videoId)
    // 2. If not cached, fetch via api.fetchTranscript(url)
    // 3. Save transcript via storage.saveTranscript(id, content)
    // 4. Create symbolic link via storage.createSymlink(source, target)
    // 5. Update registry via storage.updateRegistry(id, metadata)
  }

  /**
   * Check if transcript exists in cache (implements FR-2.2, TR-6)
   *
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<boolean>} True if cached, false otherwise
   * @throws {Error} Not yet implemented
   */
  async checkCache(videoId) {
    throw new Error('TranscriptService.checkCache not yet implemented');
  }
}

module.exports = TranscriptService;
