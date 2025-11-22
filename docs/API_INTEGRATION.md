# API Integration Guide

## Overview

The Transcriptor tool integrates with the **Scrape Creators API** to fetch YouTube video transcripts. This integration is a critical external dependency that enables the core functionality of converting YouTube URLs into locally-stored transcript files.

The Scrape Creators service provides a simple HTTP endpoint that accepts YouTube URLs and returns plain text transcripts. The API has specific characteristics that impact integration design:

- **Rate Limit**: 100 requests per minute
- **Timeout**: 30-second maximum request duration
- **Response Size**: 10MB maximum transcript size
- **Authentication**: API key via HTTP header

This document provides comprehensive details on the API contract, authentication requirements, error handling strategies, retry logic, and practical integration patterns implemented in the codebase.

## Authentication & Setup

### Environment Variable Configuration

The API requires authentication through an API key that must be configured in the environment before running the application. The key is stored in a `.env` file and loaded at application startup.

**Required Environment Variable:**
```bash
SCRAPE_CREATORS_API_KEY=your_api_key_here
```

**Setup Steps:**

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your API key:
   ```bash
   # .env file
   SCRAPE_CREATORS_API_KEY=sk_live_abc123xyz789...
   ```

3. Verify the configuration:
   ```bash
   transcriptor help
   ```

### Validation on Startup

The application validates the API key presence during initialization (see `src/utils/envLoader.js`). If the `SCRAPE_CREATORS_API_KEY` environment variable is missing or empty, the application exits with a clear error message:

```
Error: SCRAPE_CREATORS_API_KEY environment variable is required
Please add your API key to the .env file
```

This fail-fast approach prevents execution with invalid credentials and provides immediate feedback to users.

**Security Note**: The API key is never logged, displayed in console output, or included in error messages. All logging related to API calls sanitizes credentials to prevent accidental exposure.

## API Contract

### Endpoint Specification

**Base URL**: `https://api.scrape-creators.com`
**Endpoint**: `/transcript`
**Method**: `POST`
**Content-Type**: `application/json`
**Timeout**: 30 seconds

### Request Schema

The API accepts a JSON payload with a single required field:

```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Full YouTube video URL (supports youtube.com/watch?v= and youtu.be/ formats) |

**Required Headers:**

| Header | Value | Description |
|--------|-------|-------------|
| `x-api-key` | `{SCRAPE_CREATORS_API_KEY}` | Authentication credential from environment |
| `Content-Type` | `application/json` | Request body format |

### Response Schema

Successful responses return JSON with the transcript content:

```json
{
  "transcript_only_text": "This is the full transcript text without timestamps or speaker labels. The content is provided as plain text ready for storage or further processing."
}
```

**Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `transcript_only_text` | string | Plain text transcript without timestamps, speaker labels, or formatting. Ready for direct storage. |

**Response Characteristics:**
- Maximum size: 10MB per transcript
- Encoding: UTF-8
- Format: Plain text (no markdown, HTML, or structured format)
- Line breaks: Preserved from original transcript

### Sample Request with Axios

The application uses axios for HTTP communication. Here's a simplified example:

```javascript
const axios = require('axios');

async function fetchTranscript(videoUrl, apiKey) {
  const response = await axios.post(
    'https://api.scrape-creators.com/transcript',
    { url: videoUrl },
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 seconds
    }
  );

  return response.data.transcript_only_text;
}
```

### Sample Request with cURL

For testing or debugging purposes:

```bash
curl -X POST https://api.scrape-creators.com/transcript \
  -H "x-api-key: sk_live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
  --max-time 30
```

## Error Handling Reference

The API integration implements comprehensive error handling per Technical Requirement TR-12. Different HTTP status codes trigger different behaviors to ensure robust operation.

### Error Code Matrix

| HTTP Status | Error Type | Behavior | Rationale |
|-------------|------------|----------|-----------|
| 400 Bad Request | `INVALID_REQUEST` | Skip URL, log error, continue processing | URL is invalid or video unavailable. No retry will succeed. |
| 401 Unauthorized | `UNAUTHORIZED` | Exit process, display API key error | Invalid credentials. User must fix configuration before retry. |
| 429 Too Many Requests | `RATE_LIMITED` | Exponential backoff retry (1s, 2s, 4s), max 3 attempts | Temporary rate limit. Retry with increasing delays. |
| 500 Server Error | `SERVER_ERROR` | Skip URL, log error, continue processing | API server issue. Retry unlikely to succeed immediately. |
| 502/503 Service Unavailable | `SERVER_ERROR` | Skip URL, log error, continue processing | API infrastructure issue. Skip and process remaining URLs. |
| Network timeout | `TIMEOUT` | Skip URL, log error, continue processing | Request exceeded 30-second limit. Video may be too long or API slow. |
| Connection refused | `NETWORK` | Skip URL, log error, continue processing | Network connectivity issue. Continue with other URLs. |

### Error Handling Flow

When an error occurs during API communication, the system follows this decision tree:

```
Error Detected
    │
    ├─→ 401 Unauthorized? → Exit process with clear message
    │                        "Invalid API key. Check SCRAPE_CREATORS_API_KEY"
    │
    ├─→ 429 Rate Limited? → Check retry count
    │                       ├─→ < 3 attempts → Exponential backoff, retry
    │                       └─→ ≥ 3 attempts → Skip URL, continue
    │
    └─→ Other (400, 500, timeout, network)
                            → Log error details
                            → Skip URL
                            → Continue with next URL
```

### Error Transformation

The `APIClient` service transforms HTTP errors into application-specific error types with sanitized messages. This prevents sensitive data leakage while providing useful debugging information.

**Implementation Reference**: `src/services/APIClient.js` - `transformError()` method

**Error Transformation Examples:**

```javascript
// 401 Unauthorized
{
  type: 'UNAUTHORIZED',
  message: 'API authentication failed. Check SCRAPE_CREATORS_API_KEY',
  skipUrl: false,  // Caller should exit
  retryable: false
}

// 429 Rate Limited
{
  type: 'RATE_LIMITED',
  message: 'Rate limit exceeded (429). Retrying after delay...',
  skipUrl: false,
  retryable: true,
  retryAfter: 2000  // milliseconds
}

// 500 Server Error
{
  type: 'SERVER_ERROR',
  message: 'API server error (500). Skipping URL.',
  skipUrl: true,
  retryable: false
}
```

### Log Message Examples

The application provides detailed logging for troubleshooting:

```
[APIClient] Fetching transcript for video: dQw4w9WgXcQ
[APIClient] Request completed in 1234ms (response size: 45.2KB)

# Error scenarios:
[APIClient] Error: Invalid YouTube URL (400) - Skipping
[APIClient] Error: Rate limit exceeded (429) - Retry attempt 1 of 3 after 1000ms
[APIClient] Error: API authentication failed (401) - Check SCRAPE_CREATORS_API_KEY
[APIClient] Error: Request timeout after 30000ms - Skipping URL
```

## Retry Strategy

### When to Retry

The application implements selective retry logic based on error type. Only **429 Too Many Requests** errors trigger retry attempts, as these represent temporary rate limiting that can be resolved by waiting.

Other error types (400, 401, 500, timeout, network) do not trigger retries because:
- **400**: Request is malformed or video unavailable (retry won't fix)
- **401**: Credentials invalid (requires configuration fix)
- **500**: Server error (retry unlikely to succeed immediately)
- **Timeout**: Request too slow (immediate retry will likely timeout again)
- **Network**: Connectivity issue (retry won't fix underlying problem)

### Exponential Backoff Algorithm

When a 429 error occurs, the system waits before retrying with exponentially increasing delays:

| Attempt | Base Delay | Jitter Range | Actual Delay |
|---------|------------|--------------|--------------|
| 1 (initial) | 0ms | - | 0ms |
| 2 (retry 1) | 1000ms | ±250ms | 750-1250ms |
| 3 (retry 2) | 2000ms | ±500ms | 1500-2500ms |
| 4 (retry 3) | 4000ms | ±1000ms | 3000-5000ms |

**Jitter**: Random variation (±25%) prevents thundering herd problem when multiple clients retry simultaneously.

**Maximum Attempts**: 3 total attempts (1 initial + 2 retries). After 3 failures, the URL is skipped.

### Delay Calculation Formula

```javascript
function calculateDelay(attemptNumber) {
  const baseDelay = Math.pow(2, attemptNumber - 1) * 1000; // 1s, 2s, 4s
  const jitter = baseDelay * 0.25; // ±25%
  const randomJitter = (Math.random() * 2 - 1) * jitter; // -jitter to +jitter
  return Math.max(0, baseDelay + randomJitter);
}
```

### Retry-After Header Support

The API may return a `Retry-After` header in 429 responses, specifying the recommended wait time. The client respects this header when present:

```javascript
// Response headers from API
{
  'retry-after': '5' // Wait 5 seconds
}

// Client uses this value instead of exponential backoff
const delayMs = parseInt(retryAfterHeader) * 1000;
```

**Security Bounds**: The `Retry-After` value is capped at 60 seconds to prevent denial-of-service attacks via malicious header values.

### Code Example

**Implementation Reference**: `src/services/APIClient.js` - `fetchWithRetry()` method

Simplified retry logic:

```javascript
async function fetchWithRetry(videoUrl, maxAttempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(API_URL, { url: videoUrl }, config);
      return response.data.transcript_only_text;

    } catch (error) {
      lastError = error;

      // Only retry on 429 errors
      if (error.response?.status === 429 && attempt < maxAttempts) {
        const delay = calculateDelay(attempt);
        console.log(`Rate limited. Retrying in ${delay}ms (attempt ${attempt})`);
        await sleep(delay);
        continue;
      }

      // For other errors or max retries reached, throw immediately
      throw error;
    }
  }

  throw lastError;
}
```

## Integration Points in Codebase

### APIClient Class Architecture

The `APIClient` class (`src/services/APIClient.js`) is the primary integration point with the Scrape Creators API. It handles:

- HTTP client configuration with axios
- API key injection via request interceptors
- Request/response logging
- Error transformation and classification
- Retry logic with exponential backoff
- Response validation

**Class Structure:**

```javascript
class APIClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = null; // Axios instance
    this.requestDeduplication = new Map(); // Prevent duplicate concurrent requests
    this.retryBudget = new Map(); // Track retry attempts per video
  }

  async initialize() { /* Setup axios instance */ }

  async fetchTranscript(videoUrl) { /* Main public method */ }

  // Private helper methods:
  async _fetchWithRetry(videoUrl, attempt = 1) { /* Retry logic */ }
  _transformError(error) { /* Error classification */ }
  _validateResponse(response) { /* Response validation */ }
  _sanitizeConfig(config) { /* Remove sensitive data from logs */ }
}
```

### fetchTranscript Method Walkthrough

The `fetchTranscript()` method is the public API for retrieving transcripts:

**Method Signature:**
```javascript
/**
 * Fetch transcript for YouTube video
 * @param {string} videoUrl - Full YouTube URL
 * @returns {Promise<string>} Plain text transcript
 * @throws {Error} On authentication failure (401)
 */
async fetchTranscript(videoUrl)
```

**Execution Flow:**

1. **Input Validation**: Validate YouTube URL format
2. **Deduplication Check**: Prevent duplicate concurrent requests for same video
3. **Retry Loop**: Execute request with retry logic (max 3 attempts)
4. **Request Execution**: POST to API with authentication header
5. **Response Validation**: Check for `transcript_only_text` field and size limits
6. **Error Handling**: Transform errors to application error types
7. **Return**: Plain text transcript content

### Request/Response Interceptors

Axios interceptors handle cross-cutting concerns:

**Request Interceptor** (src/services/APIClient.js):
- Adds `x-api-key` header to all requests
- Logs sanitized request details (URL without API key)
- Validates request configuration

**Response Interceptor**:
- Logs response size and duration
- Validates response structure
- Enforces 10MB size limit per TR specifications

**Error Interceptor**:
- Catches HTTP errors and network failures
- Transforms to application error types
- Sanitizes error messages (removes API key, sensitive data)

### Integration with TranscriptService

The `TranscriptService` class (`src/services/TranscriptService.js`) orchestrates the workflow, using `APIClient` as a dependency:

```javascript
class TranscriptService {
  constructor(storageService, apiClient, pathResolver) {
    this.storage = storageService;
    this.api = apiClient; // APIClient dependency
  }

  async processVideo(videoId, url) {
    // 1. Check cache first (cache-first strategy)
    const isCached = await this._checkCache(videoId);
    if (isCached) {
      return this.storage.loadTranscript(videoId); // Skip API call
    }

    // 2. Cache miss - fetch from API
    const transcript = await this.api.fetchTranscript(url);

    // 3. Save immediately (crash resilience)
    await this.storage.saveTranscript(videoId, transcript);

    return transcript;
  }
}
```

## Testing Integration

### Testing Scenarios

Manual testing should cover these scenarios to validate API integration:

**Happy Path:**
1. Valid API key, valid YouTube URL → Transcript retrieved successfully
2. Verify `transcript_only_text` field extracted correctly
3. Check transcript saved to storage

**Error Scenarios:**
1. **Invalid API Key (401)**:
   - Remove API key from .env
   - Run `transcriptor`
   - Expect: Process exits with clear error message

2. **Invalid URL (400)**:
   - Add invalid YouTube URL to youtube.md
   - Run `transcriptor`
   - Expect: URL skipped, processing continues

3. **Rate Limit (429)**:
   - Trigger rate limit by processing 100+ videos quickly
   - Expect: Automatic retry with exponential backoff
   - Verify: Maximum 3 attempts, then skip

4. **Network Timeout**:
   - Set timeout to 1ms in APIClientConstants.js (temporary test)
   - Run `transcriptor`
   - Expect: Timeout error logged, URL skipped

5. **Server Error (500)**:
   - Mock server error (requires API testing tool)
   - Expect: URL skipped, processing continues

### Mock API Responses

For development and testing, you can use a mock server to simulate API behavior:

```javascript
// Example using nock for testing
const nock = require('nock');

// Mock successful response
nock('https://api.scrape-creators.com')
  .post('/transcript')
  .reply(200, {
    transcript_only_text: 'This is a test transcript.'
  });

// Mock rate limit with retry
nock('https://api.scrape-creators.com')
  .post('/transcript')
  .reply(429, { error: 'Rate limit exceeded' }, {
    'Retry-After': '2'
  });

// Mock authentication error
nock('https://api.scrape-creators.com')
  .post('/transcript')
  .reply(401, { error: 'Invalid API key' });
```

### Simulating Error Conditions

**API Key Validation:**
```bash
# Test missing API key
unset SCRAPE_CREATORS_API_KEY
transcriptor
# Expected: "Error: SCRAPE_CREATORS_API_KEY environment variable is required"
```

**Rate Limit Testing:**
- Process a batch of 100+ videos to trigger rate limiting
- Observe retry behavior in logs
- Verify exponential backoff delays (1s, 2s, 4s)

**Timeout Simulation:**
- Use a video known to have very long transcripts
- Monitor request duration in logs
- Verify 30-second timeout enforcement

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue 1: "API authentication failed (401)"

**Symptoms:**
- Application exits immediately with 401 error
- Message: "API authentication failed. Check SCRAPE_CREATORS_API_KEY"

**Solutions:**
1. Verify `.env` file exists in project root
2. Check `SCRAPE_CREATORS_API_KEY` is set and not empty
3. Ensure no extra spaces around API key value
4. Verify API key is valid (not expired or revoked)
5. Check `.env` is loaded (not in .gitignore'd location)

#### Issue 2: "Rate limit exceeded (429)" on every request

**Symptoms:**
- Every API call returns 429 immediately
- Retries exhaust quickly

**Solutions:**
1. Check if rate limit was exceeded recently (100/min limit)
2. Wait 60 seconds for rate limit window to reset
3. Reduce batch size to stay under 100 videos per minute
4. Verify no other instances of tool running concurrently

#### Issue 3: "Request timeout after 30000ms"

**Symptoms:**
- Requests consistently timeout at 30 seconds
- Specific videos always timeout

**Solutions:**
1. Check internet connection speed
2. Verify video is accessible (not geo-blocked or private)
3. Video may have extremely long transcript (>10MB)
4. Try same video ID directly via cURL to isolate issue
5. Check Scrape Creators API status page

#### Issue 4: All requests fail with "Invalid YouTube URL (400)"

**Symptoms:**
- Valid URLs consistently return 400 errors
- API rejects URL format

**Solutions:**
1. Verify URL format in youtube.md (one URL per line)
2. Check for extra characters or whitespace
3. Ensure URL is complete (includes https://)
4. Verify video ID extraction regex is working
5. Test URL directly with cURL to verify API accepts it

### Debug Logging

Enable detailed logging by modifying `src/constants/APIClientConstants.js`:

```javascript
// Temporarily enable debug mode
const API_CLIENT_CONFIG = {
  // ... existing config
  validateStatus: (status) => status < 500, // Accept all client errors
  debug: true // Enable detailed axios logging
};
```

This will output full request/response details for troubleshooting.

### API Key Validation

Verify your API key is correctly loaded:

```javascript
// src/utils/envLoader.js
function loadEnv() {
  require('dotenv').config();

  const apiKey = process.env.SCRAPE_CREATORS_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    console.error('Error: SCRAPE_CREATORS_API_KEY environment variable is required');
    console.error('Please add your API key to the .env file');
    process.exit(1);
  }

  // Debug: Show first/last 4 chars (never log full key)
  console.log(`API Key loaded: ${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`);

  return { apiKey };
}
```

## Configuration Constants

Key configuration values from `src/constants/APIClientConstants.js`:

```javascript
const API_CLIENT_CONFIG = {
  BASE_URL: 'https://api.scrape-creators.com',
  TIMEOUT: 30000,                    // 30 seconds
  MAX_RETRIES: 3,                    // Maximum retry attempts
  RETRY_DELAYS: [1000, 2000, 4000],  // Exponential backoff (ms)
  MAX_RETRY_AFTER: 60000,            // Maximum Retry-After value (60s)
  MAX_TRANSCRIPT_SIZE: 10485760      // 10MB in bytes
};

const ERROR_TYPES = {
  INVALID_REQUEST: 'INVALID_REQUEST',     // 400
  UNAUTHORIZED: 'UNAUTHORIZED',           // 401
  RATE_LIMITED: 'RATE_LIMITED',           // 429
  SERVER_ERROR: 'SERVER_ERROR',           // 500, 502, 503
  TIMEOUT: 'TIMEOUT',                     // ETIMEDOUT
  NETWORK: 'NETWORK'                      // ECONNREFUSED, etc.
};
```

## Rate Limiting Strategy

The API enforces a **100 requests per minute** rate limit. The integration handles this through:

1. **Exponential Backoff**: Automatic retry with increasing delays on 429 errors
2. **Retry Budget**: Tracks retry attempts per video to prevent infinite loops
3. **Request Deduplication**: Prevents duplicate concurrent requests for same video
4. **Sequential Processing**: Processes URLs one at a time (not concurrent)

**Best Practices:**
- Process videos in batches of <100 per minute
- Allow retry logic to handle rate limits automatically
- Monitor logs for frequent 429 errors (may indicate need to slow down)
- Use cache-first strategy to minimize API calls

## Security Considerations

### API Key Protection

- **Never log**: API key is never written to console or log files
- **Environment only**: Key stored in .env file, not hardcoded
- **Sanitized errors**: Error messages never include API key
- **Request logging**: Sanitizes request config before logging

### HTTPS Enforcement

All API communication uses HTTPS to prevent man-in-the-middle attacks. The axios client enforces HTTPS URLs.

### Response Data Sanitization

Error contexts sanitize response data to prevent logging sensitive information:

```javascript
function sanitizeResponseData(data) {
  if (typeof data === 'object') {
    return '[Object]'; // Don't log full response objects in errors
  }
  return String(data).slice(0, 100); // Truncate long strings
}
```

### Retry-After Validation

The `Retry-After` header value is validated to prevent DoS attacks:

```javascript
const retryAfter = parseInt(header);
if (isNaN(retryAfter) || retryAfter < 0 || retryAfter > 60) {
  // Ignore malicious values, use default backoff
  return calculateExponentialDelay(attempt);
}
```

## YouTube oEmbed API Integration

The system integrates with YouTube's public oEmbed API to fetch video metadata (title and channel name) without authentication. This metadata enhances transcript files with contextual information.

### Endpoint Specification

**Base URL**: `https://www.youtube.com/oembed`
**Method**: `GET`
**Authentication**: None required (public API)
**Timeout**: 15 seconds

### Request Schema

The API accepts query parameters in the URL:

```
GET https://www.youtube.com/oembed?url={encoded_youtube_url}&format=json
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL-encoded full YouTube video URL (e.g., `https://youtu.be/dQw4w9WgXcQ`) |
| `format` | string | Yes | Response format - always `json` |

**Example Request:**
```
https://www.youtube.com/oembed?url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ&format=json
```

### Response Schema

Successful responses return JSON with video metadata:

```json
{
  "title": "How to Build REST APIs - Complete Tutorial",
  "author_name": "JavaScript Mastery",
  "author_url": "https://www.youtube.com/@javascriptmastery",
  "type": "video",
  "height": 113,
  "width": 200,
  "version": "1.0",
  "provider_name": "YouTube",
  "provider_url": "https://www.youtube.com/",
  "thumbnail_height": 360,
  "thumbnail_width": 480,
  "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "html": "<iframe width=\"200\" height=\"113\" src=\"https://www.youtube.com/embed/dQw4w9WgXcQ?feature=oembed\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share\" referrerpolicy=\"strict-origin-when-cross-origin\" allowfullscreen title=\"Video Title\"></iframe>"
}
```

**Fields Used by Transcriptor:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Original video title (preserved as-is for display) |
| `author_name` | string | Channel name/creator name |

**Response Characteristics:**
- Encoding: UTF-8
- Format: JSON
- Unused fields: Ignored (only title and author_name extracted)

### Sample Request with Axios

```javascript
const axios = require('axios');

async function fetchMetadata(videoId) {
  const videoUrl = `https://youtu.be/${videoId}`;
  const encodedUrl = encodeURIComponent(videoUrl);

  const response = await axios.get(
    `https://www.youtube.com/oembed?url=${encodedUrl}&format=json`,
    {
      timeout: 15000 // 15 seconds
    }
  );

  return {
    title: response.data.title,
    channel: response.data.author_name
  };
}
```

### Sample Request with cURL

For testing or debugging purposes:

```bash
curl -X GET "https://www.youtube.com/oembed?url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ&format=json" \
  --max-time 15
```

### Error Handling

The metadata fetch is **non-fatal** - if it fails, the system uses fallback values and continues processing the transcript.

**Error Code Matrix:**

| HTTP Status | Error Type | Behavior | Fallback Values |
|-------------|------------|----------|-----------------|
| 404 Not Found | `VIDEO_NOT_FOUND` | Use fallback, log warning, continue | channel: "Unknown Channel"<br>title: "Unknown Title" |
| 400 Bad Request | `INVALID_REQUEST` | Use fallback, log warning, continue | channel: "Unknown Channel"<br>title: "Unknown Title" |
| 500 Server Error | `SERVER_ERROR` | Use fallback, log warning, continue | channel: "Unknown Channel"<br>title: "Unknown Title" |
| Network timeout | `TIMEOUT` | Use fallback, log warning, continue | channel: "Unknown Channel"<br>title: "Unknown Title" |

**Key Difference from Transcript API**: Metadata failures are **non-fatal**. Unlike transcript fetch failures which skip the URL entirely, metadata failures allow processing to continue with placeholder values.

### Error Transformation

**Implementation Reference**: `src/services/MetadataService.js` - `fetchVideoMetadata()` method

**Error Handling Examples:**

```javascript
// 404 Not Found (video private/deleted)
{
  type: 'VIDEO_NOT_FOUND',
  message: 'Video metadata unavailable (404). Using fallback values.',
  fatal: false,
  fallback: {
    channel: 'Unknown Channel',
    title: 'Unknown Title'
  }
}

// 500 Server Error
{
  type: 'SERVER_ERROR',
  message: 'YouTube oEmbed API error (500). Using fallback values.',
  fatal: false,
  fallback: {
    channel: 'Unknown Channel',
    title: 'Unknown Title'
  }
}

// Network Timeout
{
  type: 'TIMEOUT',
  message: 'Metadata fetch timeout after 15000ms. Using fallback values.',
  fatal: false,
  fallback: {
    channel: 'Unknown Channel',
    title: 'Unknown Title'
  }
}
```

### Log Message Examples

```
[MetadataService] Fetching metadata for video: dQw4w9WgXcQ
[MetadataService] Metadata fetched: "How to Build REST APIs" by "JavaScript Mastery"

# Error scenarios:
[MetadataService] Warning: Video not found (404) - Using fallback values
[MetadataService] Warning: oEmbed API timeout after 15000ms - Using fallback values
[MetadataService] Warning: oEmbed server error (500) - Using fallback values
```

### No Retry Strategy

Unlike the Scrape Creators API, the oEmbed API does **not** implement retry logic:

**Rationale**:
- Metadata is non-critical (fallback values are acceptable)
- Reduces processing time for failed metadata fetches
- Simplifies error handling (immediate fallback)
- Prevents unnecessary API load

**Behavior on Error**: Single attempt → immediate fallback

### Parallel Fetching

Metadata and transcript are fetched **concurrently** using `Promise.all()` to minimize total processing time:

**Implementation Reference**: `src/services/TranscriptService.js` - `processVideo()` method

```javascript
async function processVideo(videoId, url) {
  // Parallel fetch for new videos
  const [transcript, metadata] = await Promise.all([
    apiClient.fetchTranscript(url),
    metadataService.fetchVideoMetadata(videoId)
  ]);

  // Both complete (or fail) before continuing
  return { transcript, metadata };
}
```

**Benefits**:
- Reduced processing time: 15-30 second savings per video
- API calls don't block each other
- Independent error handling (one can fail without affecting the other)

**Error Isolation**: If metadata fetch fails, transcript fetch continues unaffected

### Integration with File Naming

The fetched title is used to generate descriptive filenames:

**Title Formatting Utility** (`src/utils/titleFormatter.js`):
- Input: `"How to Build REST APIs - Complete Tutorial"`
- Process: Lowercase → replace spaces → sanitize → truncate
- Output: `"how_to_build_rest_apis_complete_tutorial"`
- Filename: `"tr_dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md"`

**Filename Pattern**: `tr_{youtubeID}_{formatted_title}.md`

**Fallback Filename**: If title is "Unknown Title", format as `"tr_{videoId}_unknown_title.md"`

**File Locations**: The same naming pattern is applied to both storage locations:
- Project directory: `./transcripts/tr_{youtubeID}_{formatted_title}.md`
- Global registry: `~/.transcriptor/transcripts/tr_{youtubeID}_{formatted_title}.md`

### Integration with File Content

The fetched metadata populates a structured markdown header in each transcript file:

**Transcript File Structure**:
```markdown
# Transcript

## Information

- **Channel**: javascript_mastery
- **Title**: how_to_build_rest_apis_complete_tutorial
- **Youtube ID**: dQw4w9WgXcQ
- **URL**: https://youtu.be/dQw4w9WgXcQ

## Content

[Transcript content follows...]
```

**Field Descriptions**:
- `Channel`: From `author_name` field, sanitized and formatted (or "Unknown Channel")
- `Title`: From `title` field, sanitized and formatted (or "Unknown Title")
- `Youtube ID`: Video identifier
- `URL`: Standardized short URL format

### Testing Integration

**Testing Scenarios:**

**Happy Path:**
1. Valid video ID → Metadata retrieved successfully
2. Verify `title` and `author_name` fields extracted correctly
3. Check metadata appears in file header
4. Verify formatted title used in filename

**Error Scenarios:**

1. **Private/Deleted Video (404)**:
   - Use video that's been deleted or made private
   - Expect: Fallback values used, warning logged
   - Verify: Transcript processing continues

2. **Invalid Video ID (400)**:
   - Use malformed video ID
   - Expect: Fallback values used, warning logged
   - Verify: File created with fallback metadata

3. **Network Timeout**:
   - Simulate slow network (testing tool required)
   - Expect: Timeout after 15s, fallback values used
   - Verify: Transcript processing not delayed

4. **Server Error (500)**:
   - Mock server error (requires API testing tool)
   - Expect: Fallback values used, warning logged
   - Verify: Processing continues

### Mock API Responses

For development and testing:

```javascript
// Example using nock for testing
const nock = require('nock');

// Mock successful response
nock('https://www.youtube.com')
  .get('/oembed')
  .query({ url: 'https://youtu.be/dQw4w9WgXcQ', format: 'json' })
  .reply(200, {
    title: 'Test Video Title',
    author_name: 'Test Channel',
    type: 'video',
    provider_name: 'YouTube'
  });

// Mock 404 error
nock('https://www.youtube.com')
  .get('/oembed')
  .query({ url: 'https://youtu.be/invalidID', format: 'json' })
  .reply(404, { error: 'Not Found' });
```

## Registry Data Schema (data.json)

The application maintains a global registry at `~/.transcriptor/data.json` that tracks all processed videos and their metadata. This registry is updated after each successful transcript download and is used for caching, cleanup operations, and cross-session state management.

### Registry File Location

**Path**: `~/.transcriptor/data.json`
**Format**: JSON
**Encoding**: UTF-8
**Access Pattern**: Read at startup, write after each video processed

### Schema Structure

The registry is a JSON object with a single top-level array:

```json
{
  "videos": [
    {
      "youtubeId": "dQw4w9WgXcQ",
      "channel": "javascript_mastery",
      "title": "how_to_build_rest_apis_complete_tutorial",
      "date_added": "251122T1430"
    },
    {
      "youtubeId": "xyz789abc123",
      "channel": "tech_channel",
      "title": "nodejs_fundamentals_explained",
      "date_added": "251121T0915"
    }
  ]
}
```

### Field Specifications

| Field | Type | Required | Format | Description |
|-------|------|----------|--------|-------------|
| `youtubeId` | string | Yes | YouTube video ID (11 chars) | Unique identifier for the video |
| `channel` | string | Yes | Sanitized lowercase | Formatted channel name (sanitized like title) |
| `title` | string | Yes | Sanitized lowercase | Formatted video title (sanitized) |
| `date_added` | string | Yes | `YYMMDDTHHMM` | Timestamp when video was added to registry |

### Date Format Details

**Format**: `YYMMDDTHHMM`

**Components**:
- `YY`: Two-digit year (e.g., `25` for 2025)
- `MM`: Two-digit month (01-12)
- `DD`: Two-digit day (01-31)
- `T`: Literal separator character
- `HH`: Two-digit hour in 24-hour format (00-23)
- `MM`: Two-digit minute (00-59)

**Examples**:
- `251122T1430` = November 22, 2025 at 2:30 PM
- `251225T0000` = December 25, 2025 at midnight
- `260101T2359` = January 1, 2026 at 11:59 PM

**Usage in Cleanup Operations**: When matching dates for cleanup, only the `YYMMDD` portion is compared, ignoring the `THHMM` time component.

### Title and Channel Formatting

Both `channel` and `title` fields store **formatted versions** of the metadata:

**Formatting Process** (applied by `src/utils/titleFormatter.js`):
1. Convert to lowercase
2. Replace spaces with underscores
3. Remove special characters (keep alphanumeric, underscores, hyphens)
4. Truncate to maximum length (default: 100 characters)
5. Remove leading/trailing underscores

**Examples**:

| Original | Formatted |
|----------|-----------|
| "JavaScript Mastery" | "javascript_mastery" |
| "How to Build REST APIs - Tutorial!" | "how_to_build_rest_apis_tutorial" |
| "Tech & Code" | "tech_code" |
| "Unknown Channel" | "unknown_channel" |

**Consistency**: The same formatted values are used in:
- Registry `channel` and `title` fields
- Transcript filenames
- Transcript file content headers

### Schema Changes from Previous Versions

**Removed Fields**:
- `links` array - No longer tracked in registry (symbolic links removed from system)

**Modified Fields**:
- `date_added`: Changed from `YYYY-MM-DD` format to `YYMMDDTHHMM` format
- `channel`: Now stores formatted/sanitized version instead of original
- `title`: Now stores formatted/sanitized version instead of original

### Registry Update Flow

**When**: After each successful video processing

**Process**:
1. Fetch transcript and metadata from APIs
2. Format channel and title using `titleFormatter.js`
3. Generate timestamp in `YYMMDDTHHMM` format
4. Create new entry object
5. Load existing `data.json`
6. Check for duplicates (by `youtubeId`)
7. Add new entry to `videos` array (if not duplicate)
8. Write updated registry back to disk

**Implementation Reference**: `src/services/RegistryService.js` - `addVideoEntry()` method

### Duplicate Prevention

The registry prevents duplicate entries by checking `youtubeId`:

```javascript
function isDuplicate(youtubeId, existingVideos) {
  return existingVideos.some(video => video.youtubeId === youtubeId);
}
```

If a video is processed multiple times (e.g., user runs tool again with same URL):
- Registry entry is NOT duplicated
- Existing entry remains unchanged
- Transcript file may be overwritten in storage

### Registry Initialization

**First Run**: If `~/.transcriptor/data.json` doesn't exist, it's created with empty structure:

```json
{
  "videos": []
}
```

**Directory Creation**: If `~/.transcriptor/` directory doesn't exist, it's created automatically with appropriate permissions (755).

### Error Handling

**Registry Write Failures**:
- Error logged to console
- Processing continues (non-fatal)
- Video transcript still saved to disk
- Retry on next video processing

**Registry Read Failures**:
- Treated as empty registry
- New registry file created
- Warning logged to console

**Corrupted Registry**:
- JSON parse error handled gracefully
- Backup created: `data.json.backup.{timestamp}`
- Fresh registry initialized
- Error logged with recovery details

### Cleanup Integration

The registry is used by the cleanup routine to identify old transcripts:

**Cleanup Process**:
1. Read `data.json` registry
2. Filter entries by date (compare `YYMMDD` portion only)
3. Identify transcripts older than threshold (e.g., 30 days)
4. Delete corresponding transcript files
5. Remove entries from registry
6. Write updated registry back to disk

**Date Matching Example**:

```javascript
// Entry: "251122T1430" (Nov 22, 2025 at 2:30 PM)
// Entry: "251122T0900" (Nov 22, 2025 at 9:00 AM)
// Both match date "251122" regardless of time

function matchesDate(dateAdded, targetDate) {
  const entryDate = dateAdded.substring(0, 6); // Extract YYMMDD
  return entryDate === targetDate;
}
```

**Implementation Reference**: `src/services/CleanupService.js` - `cleanOldTranscripts()` method

### Sample Registry File

**Complete Example** (`~/.transcriptor/data.json`):

```json
{
  "videos": [
    {
      "youtubeId": "dQw4w9WgXcQ",
      "channel": "javascript_mastery",
      "title": "how_to_build_rest_apis_complete_tutorial",
      "date_added": "251122T1430"
    },
    {
      "youtubeId": "abc123xyz789",
      "channel": "fireship",
      "title": "nodejs_in_100_seconds",
      "date_added": "251121T0915"
    },
    {
      "youtubeId": "qwerty12345",
      "channel": "traversy_media",
      "title": "javascript_crash_course_for_beginners",
      "date_added": "251120T1645"
    },
    {
      "youtubeId": "mnbvcx54321",
      "channel": "unknown_channel",
      "title": "unknown_title",
      "date_added": "251119T2130"
    }
  ]
}
```

**Notes**:
- Videos sorted by `date_added` (newest first - optional, not enforced)
- Each entry corresponds to a transcript file: `tr_{youtubeId}_{title}.md`
- Fallback values shown in last entry (metadata fetch failed)

### Validation Rules

The registry service validates entries before writing:

**Required Validations**:
1. `youtubeId` must be non-empty string
2. `youtubeId` must be exactly 11 characters
3. `channel` must be non-empty string
4. `title` must be non-empty string
5. `date_added` must match `YYMMDDTHHMM` format
6. No duplicate `youtubeId` values

**Invalid Entry Handling**:
- Entry rejected with error logged
- Registry write operation aborted
- User notified of validation failure

### Migration from Old Format

If upgrading from a previous version with different schema:

**Migration Strategy**:
1. Detect old format (presence of `links` array or `YYYY-MM-DD` date format)
2. Create backup: `data.json.pre-migration.backup`
3. Transform each entry:
   - Remove `links` field
   - Convert `date_added` from `YYYY-MM-DD` to `YYMMDDTHHMM` (default time: `T0000`)
   - Re-format `channel` and `title` fields (if storing original versions)
4. Write migrated registry
5. Log migration summary

**Implementation Reference**: `src/services/RegistryMigration.js` - `migrateRegistry()` method

## References

- **Implementation**: `src/services/APIClient.js`, `src/services/MetadataService.js`, `src/services/RegistryService.js`
- **Constants**: `src/constants/APIClientConstants.js`
- **Error Handling**: `src/utils/ErrorHandler.js`
- **URL Validation**: `src/utils/URLValidator.js`
- **Title Formatting**: `src/utils/titleFormatter.js`
- **Functional Requirements**: FR-2.1 (Transcript Acquisition), FR-2.2 (Metadata Acquisition), FR-2.5 (Title Formatting), FR-11 (File Structure)
- **Technical Requirements**: TR-11 (API Key Management), TR-12 (API Failures), TR-20 (Metadata Acquisition), TR-21 (Title Formatting), TR-29 (Metadata Errors)
- **Scrape Creators API Documentation**: Contact vendor for official docs
- **YouTube oEmbed API Documentation**: https://oembed.com/providers/youtube
