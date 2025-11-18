/**
 * API Client Service
 *
 * Handles external API communication with Scrape Creators API
 * Implements FR-2.1, TR-12 error handling
 *
 * @class APIClient
 */
class APIClient {
  /**
   * @param {string} apiKey - Scrape Creators API key
   */
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.scrape-creators.com';
    this.timeout = 30000; // 30 seconds per TR specs
  }

  /**
   * Fetch transcript for YouTube video (implements FR-2.1)
   *
   * @param {string} url - Full YouTube URL
   * @returns {Promise<string>} Transcript text (transcript_only_text property)
   * @throws {Error} Not yet implemented
   */
  async fetchTranscript(url) {
    throw new Error('APIClient.fetchTranscript not yet implemented');
    // Future implementation:
    // - POST to /transcript endpoint
    // - Set x-api-key header
    // - Handle errors per TR-12 (401, 429, timeout)
    // - Return transcript_only_text from response
  }
}

module.exports = APIClient;
