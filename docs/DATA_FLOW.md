# Data Flow Documentation

## Overview

This document provides an end-to-end walkthrough of how data flows through the Transcriptor system, from YouTube URLs in a markdown file to locally-accessible transcript files via symbolic links. Understanding this flow is critical for maintaining the codebase, debugging issues, and extending functionality.

The complete data flow consists of nine distinct stages:

1. **YouTube URL Input** - Reading and parsing URLs from youtube.md
2. **Cache Check** - Determining if transcripts already exist
3. **Parallel API Fetch** - Retrieving transcripts and metadata from external services (cache miss only)
4. **Metadata Processing** - Formatting title and building metadata header
5. **Transcript Storage** - Persisting content with metadata header to central repository
6. **Registry Update** - Recording video metadata in data.json
7. **Link Creation** - Creating symbolic links in project directory with formatted filenames
8. **Batch Processing & Summary** - Sequential processing with error handling
9. **Statistics Display** - Summary with metadata-enhanced information

Each stage implements specific functional and technical requirements while maintaining crash resilience through atomic operations.

## Stage 1: YouTube URL Input

### Source and Format

Transcripts are requested through a markdown file named `youtube.md` in the current working directory where the `transcriptor` command is executed.

**File Location**: `./youtube.md` (current directory)

**Format Specification**:
- One YouTube URL per line
- Whitespace is trimmed automatically
- Empty lines are ignored
- Lines without valid YouTube URLs are skipped with warning

**Supported URL Formats**:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `http://` URLs (auto-upgraded to HTTPS)

**Example youtube.md Content**:
```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/jNQXAC9IVRw
https://www.youtube.com/watch?v=9bZkp7q19f0

# Comments or non-URL lines are skipped
https://www.youtube.com/watch?v=oHg5SJYRHA0
```

### URL Parsing and Extraction

When the user runs `transcriptor`, the system reads youtube.md and extracts video IDs using a regular expression.

**Regex Pattern** (from `src/utils/YouTubeConstants.js`):
```javascript
const YOUTUBE_URL_PATTERNS = {
  STANDARD: /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
  SHORT: /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  COMBINED: /(?:youtu\.be\/|youtube\.com\/watch\?v=)([^&\s]+)/
};
```

**Extraction Process**:
1. Read youtube.md file content
2. Split by newlines
3. Trim whitespace from each line
4. Apply regex to extract video ID (capture group 1)
5. Validate extracted ID (exactly 11 characters, alphanumeric + dash/underscore)
6. Skip invalid URLs with warning message

**Code Reference**: `src/services/TranscriptService.js` - `extractVideoId()` method

**Example Parsing**:
```javascript
Input: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s"
Regex Match: "dQw4w9WgXcQ"
Validation: 11 chars, alphanumeric → Valid
Output: "dQw4w9WgXcQ"

Input: "https://youtu.be/jNQXAC9IVRw"
Regex Match: "jNQXAC9IVRw"
Validation: 11 chars, alphanumeric → Valid
Output: "jNQXAC9IVRw"

Input: "https://www.youtube.com/invalid"
Regex Match: null
Output: null (logged as "Invalid YouTube URL format, skipping")
```

### Video ID Validation

After extraction, video IDs undergo validation per TR-5 requirements:

**Validation Rules**:
- Length: Exactly 11 characters
- Characters: Alphanumeric plus dash and underscore `[a-zA-Z0-9_-]`
- No special characters or spaces

**Code Reference**: `src/utils/validators.js` - `sanitizeVideoId()`

**Validation Examples**:
```javascript
Valid:
  "dQw4w9WgXcQ"  ✓
  "jNQXAC9IVRw"  ✓
  "9bZkp7q19f0"  ✓
  "oHg5SJYRHA0"  ✓

Invalid:
  "abc123"       ✗ (too short)
  "dQw4w9WgXcQ!"  ✗ (special character)
  "video id"     ✗ (space)
  "dQw4w9WgXcQextra" ✗ (too long)
```

### Error Handling

Invalid URLs are handled gracefully per FR-10.1 (continue after failures):

**Behavior**:
- Log warning: `"Invalid YouTube URL format: {url} - Skipping"`
- Do not exit process
- Continue processing remaining URLs
- Include in final error count

**Example Log Output**:
```
[TranscriptService] Processing 5 URLs from youtube.md
[TranscriptService] Invalid YouTube URL format: https://www.invalid.com - Skipping
[TranscriptService] Processing video: dQw4w9WgXcQ
[TranscriptService] Processing video: jNQXAC9IVRw
...
Summary: 3 successful, 1 failed, 1 invalid
```

## Stage 2: Cache Check

The system implements a cache-first strategy (BR-1) where existing transcripts are always retrieved from local storage before making API calls.

### Registry Loading

**File**: `~/.transcriptor/data.json`
**Structure**: JSON object mapping video IDs to metadata

The registry is loaded once at the start of processing:

**Code Reference**: `src/services/StorageService.js` - `loadRegistry()`

```javascript
async function loadRegistry() {
  const registryPath = this.paths.getRegistryPath(); // ~/.transcriptor/data.json

  // Check if file exists
  const exists = await fs.pathExists(registryPath);
  if (!exists) {
    return {}; // Empty registry
  }

  // Read and parse JSON
  const content = await fs.readFile(registryPath, 'utf8');
  const data = JSON.parse(content);

  // Validate structure
  if (!this.isValidRegistryStructure(data)) {
    console.warn('Registry corrupted, regenerating...');
    return {};
  }

  return data;
}
```

**Example Registry Content**:
```json
{
  "dQw4w9WgXcQ": {
    "date_added": "2025-11-19",
    "channel": "JavaScript Mastery",
    "title": "How to Build REST APIs - Complete Tutorial",
    "links": [
      "/Users/developer/project1/transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md",
      "/Users/developer/project2/transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md"
    ]
  },
  "jNQXAC9IVRw": {
    "date_added": "2025-11-18",
    "channel": "Tech with Tim",
    "title": "Python Tutorial for Beginners",
    "links": [
      "/Users/developer/project1/transcripts/jNQXAC9IVRw_python_tutorial_for_beginners.md"
    ]
  }
}
```

### Cache Check Logic

For each video ID, the system performs two checks:

**Check 1: Registry Entry Exists**
```javascript
const registry = await this.storage.loadRegistry();
const entryExists = registry.hasOwnProperty(videoId);
```

**Check 2: Transcript File Exists**
```javascript
// When checking cache, we look for any file matching the video ID pattern
// since the formatted title portion may vary
const transcriptPattern = `~/.transcriptor/transcripts/${videoId}_*.md`;
const fileExists = await fs.pathExists(transcriptPath);
```

**Cache Hit Determination**:
```javascript
const isCacheHit = entryExists && fileExists;
```

**Code Reference**: `src/services/TranscriptService.js` - `_checkCache()`

### Cache Hit Branch

When cache hit detected (both registry entry and file exist):

1. **Skip API Call**: Do not fetch from external service
2. **Load from Storage**: Read transcript content from file
3. **Track Statistics**: Increment cache hit counter
4. **Log Event**: `"Cache hit for video: {videoId}"`
5. **Create Link**: Ensure project-local symbolic link exists
6. **Update Registry Links**: Add current project path if not already tracked

**Performance Impact**: Cache hits are ~100x faster than API fetches (file read vs HTTP request)

### Cache Miss Branch

When cache miss detected (either no registry entry or file missing):

1. **Track Statistics**: Increment cache miss counter
2. **Log Event**: `"Cache miss for video: {videoId} - Fetching from API"`
3. **Proceed to API Fetch**: Continue to Stage 3

### Cache Statistics Tracking

The system maintains statistics throughout processing:

```javascript
this.stats = {
  cacheHits: 0,      // Videos retrieved from cache
  cacheMisses: 0,    // Videos fetched from API
  linksCreated: 0,   // Symbolic links created
  linksFailed: 0,    // Link creation failures
  startTime: Date.now()
};
```

**Code Reference**: `src/services/TranscriptService.js` - constructor and stats object

**Example Log Output**:
```
[TranscriptService] Processing video: dQw4w9WgXcQ
[TranscriptService] Cache hit for video: dQw4w9WgXcQ
[TranscriptService] Processing video: jNQXAC9IVRw
[TranscriptService] Cache miss for video: jNQXAC9IVRw - Fetching from API
...
Summary: 5 processed (3 from cache, 2 newly fetched)
```

## Stage 3: Parallel API Fetch (Cache Miss Only)

When a cache miss occurs, the system fetches both the transcript and metadata in parallel using `Promise.all()`. This minimizes total processing time per video.

### Parallel Execution Strategy

**Implementation**: `src/services/TranscriptService.js` - `processVideo()` method

```javascript
async function processVideo(videoId, url) {
  // Check cache first
  const isCached = await this._checkCache(videoId);
  if (isCached) {
    return this.storage.loadTranscript(videoId);
  }

  // Cache miss: Fetch transcript and metadata in parallel
  const [transcript, metadata] = await Promise.all([
    this.apiClient.fetchTranscript(url),
    this.metadataService.fetchVideoMetadata(videoId)
  ]);

  // Both complete (or fail independently) before continuing
  return { transcript, metadata };
}
```

**Benefits**:
- Reduced total wait time: ~15-30 seconds saved per video
- Independent error handling: Metadata failure doesn't block transcript fetch
- Better resource utilization: Both APIs called concurrently

### Transcript Fetch (Scrape Creators API)

When a cache miss occurs, the system fetches the transcript from the Scrape Creators API.

### Request Construction

**Endpoint**: `POST https://api.scrape-creators.com/transcript`

**Headers**:
```javascript
{
  'x-api-key': process.env.SCRAPE_CREATORS_API_KEY,
  'Content-Type': 'application/json'
}
```

**Request Body**:
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

**Configuration**:
- Timeout: 30 seconds
- Method: POST
- Response Type: JSON

**Code Reference**: `src/services/APIClient.js` - `fetchTranscript()`

### Request Execution

```javascript
async function fetchTranscript(videoUrl) {
  const response = await this.client.post('/transcript', {
    url: videoUrl
  }, {
    timeout: 30000,
    headers: {
      'x-api-key': this.apiKey
    }
  });

  // Extract transcript text from response
  return response.data.transcript_only_text;
}
```

### Response Parsing

**Expected Response**:
```json
{
  "transcript_only_text": "Hello and welcome to this video tutorial. Today we're going to learn about JavaScript promises..."
}
```

**Extraction**:
```javascript
const transcript = response.data.transcript_only_text;

// Validate field exists
if (!transcript || typeof transcript !== 'string') {
  throw new Error('Invalid API response: missing transcript_only_text');
}

// Validate size (10MB limit per TR specifications)
const sizeBytes = Buffer.byteLength(transcript, 'utf8');
if (sizeBytes > 10 * 1024 * 1024) {
  throw new Error(`Transcript too large: ${sizeBytes} bytes (10MB max)`);
}

return transcript;
```

### Error Handling Matrix

Different HTTP status codes trigger different behaviors per TR-12:

| Status | Type | Action | Reason |
|--------|------|--------|--------|
| 200 OK | Success | Return transcript | Valid response received |
| 400 Bad Request | Invalid | Skip URL, log, continue | URL invalid or video unavailable |
| 401 Unauthorized | Auth Error | Exit process | Invalid API key - requires fix |
| 429 Rate Limited | Retry | Exponential backoff (1s, 2s, 4s) | Temporary - retry helps |
| 500 Server Error | Server Issue | Skip URL, log, continue | API problem - retry won't help |
| ETIMEDOUT | Timeout | Skip URL, log, continue | Request took >30s |
| ECONNREFUSED | Network | Skip URL, log, continue | Connection problem |

**Error Handling Examples**:

**400 Bad Request**:
```javascript
catch (error) {
  if (error.response?.status === 400) {
    console.log(`[APIClient] Invalid URL (400): ${videoUrl} - Skipping`);
    return null; // Signal to skip this URL
  }
}
```

**401 Unauthorized**:
```javascript
catch (error) {
  if (error.response?.status === 401) {
    console.error('[APIClient] API authentication failed (401)');
    console.error('Check SCRAPE_CREATORS_API_KEY in .env file');
    process.exit(1); // Exit entire process
  }
}
```

**429 Rate Limited with Retry**:
```javascript
catch (error) {
  if (error.response?.status === 429) {
    const attempt = 1;
    const maxAttempts = 3;

    while (attempt <= maxAttempts) {
      const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      console.log(`[APIClient] Rate limited (429) - Retry ${attempt} after ${delay}ms`);

      await sleep(delay);
      // Retry request
      try {
        const response = await this.client.post(/* ... */);
        return response.data.transcript_only_text;
      } catch (retryError) {
        if (retryError.response?.status !== 429) {
          throw retryError; // Different error, don't retry
        }
        attempt++;
      }
    }

    console.log('[APIClient] Max retries reached (3) - Skipping');
    return null;
  }
}
```

**500 Server Error**:
```javascript
catch (error) {
  if (error.response?.status === 500) {
    console.log(`[APIClient] Server error (500) - Skipping URL`);
    return null;
  }
}
```

**Network Timeout**:
```javascript
catch (error) {
  if (error.code === 'ETIMEDOUT') {
    console.log(`[APIClient] Request timeout after 30000ms - Skipping`);
    return null;
  }
}
```

### Request/Response Logging

The system logs all API interactions (with sanitized data):

```
[APIClient] Fetching transcript for video: dQw4w9WgXcQ
[APIClient] Request: POST /transcript (timeout: 30000ms)
[APIClient] Response: 200 OK (1234ms, 45.2KB)
```

For errors:
```
[APIClient] Error: Invalid YouTube URL (400) - Skipping
[APIClient] Error: Rate limit exceeded (429) - Retry 1 of 3 after 1000ms
[APIClient] Error: API authentication failed (401) - Check API key
```

**Security Note**: API key is never logged. Request/response logging sanitizes sensitive data.

### Metadata Fetch (YouTube oEmbed API)

Concurrently with the transcript fetch, the system retrieves video metadata from YouTube's public oEmbed API.

#### Request Construction

**Endpoint**: `GET https://www.youtube.com/oembed`

**Query Parameters**:
```javascript
{
  url: encodeURIComponent(`https://youtu.be/${videoId}`),
  format: 'json'
}
```

**Configuration**:
- Timeout: 15 seconds
- Method: GET
- Response Type: JSON
- Authentication: None (public API)

**Code Reference**: `src/services/MetadataService.js` - `fetchVideoMetadata()`

#### Request Execution

```javascript
async function fetchVideoMetadata(videoId) {
  const videoUrl = `https://youtu.be/${videoId}`;
  const encodedUrl = encodeURIComponent(videoUrl);

  const response = await axios.get(
    `https://www.youtube.com/oembed?url=${encodedUrl}&format=json`,
    { timeout: 15000 }
  );

  return {
    channel: response.data.author_name,
    title: response.data.title
  };
}
```

#### Response Parsing

**Expected Response**:
```json
{
  "title": "How to Build REST APIs - Complete Tutorial",
  "author_name": "JavaScript Mastery",
  "type": "video",
  "provider_name": "YouTube"
}
```

**Extraction**:
```javascript
const metadata = {
  channel: response.data.author_name,
  title: response.data.title
};

// Validate fields exist
if (!metadata.channel || !metadata.title) {
  // Use fallback values
  metadata.channel = metadata.channel || 'Unknown Channel';
  metadata.title = metadata.title || 'Unknown Title';
}

return metadata;
```

#### Error Handling (Non-Fatal)

Unlike transcript fetch errors, metadata fetch failures are **non-fatal**. Processing continues with fallback values.

**Error Handling Matrix**:

| Status | Action | Fallback Values |
|--------|--------|-----------------|
| 404 Not Found | Log warning, use fallback, continue | channel: "Unknown Channel"<br>title: "Unknown Title" |
| 400 Bad Request | Log warning, use fallback, continue | channel: "Unknown Channel"<br>title: "Unknown Title" |
| 500 Server Error | Log warning, use fallback, continue | channel: "Unknown Channel"<br>title: "Unknown Title" |
| Timeout (15s) | Log warning, use fallback, continue | channel: "Unknown Channel"<br>title: "Unknown Title" |

**Error Handling Examples**:

```javascript
catch (error) {
  if (error.response?.status === 404) {
    console.warn(`[MetadataService] Video not found (404) for ${videoId} - Using fallback`);
    return {
      channel: 'Unknown Channel',
      title: 'Unknown Title'
    };
  }

  if (error.code === 'ETIMEDOUT') {
    console.warn(`[MetadataService] Timeout after 15000ms for ${videoId} - Using fallback`);
    return {
      channel: 'Unknown Channel',
      title: 'Unknown Title'
    };
  }

  // For any other error, use fallback
  console.warn(`[MetadataService] Error fetching metadata: ${error.message} - Using fallback`);
  return {
    channel: 'Unknown Channel',
    title: 'Unknown Title'
  };
}
```

**No Retry Logic**: Unlike transcript API, metadata fetches do not retry on failure. Single attempt → immediate fallback.

**Rationale**:
- Metadata is supplementary (not critical for core functionality)
- Fallback values ensure processing continues
- Reduces processing time for failed requests
- Prevents unnecessary API load

#### Request/Response Logging

```
[MetadataService] Fetching metadata for video: dQw4w9WgXcQ
[MetadataService] Metadata fetched: "How to Build REST APIs" by "JavaScript Mastery"

# Error scenarios:
[MetadataService] Warning: Video not found (404) - Using fallback values
[MetadataService] Warning: Timeout after 15000ms - Using fallback values
```

## Stage 4: Metadata Processing

After fetching metadata (or using fallback values), the system processes it for file operations.

### Title Formatting

The video title is sanitized for filesystem compatibility.

**Code Reference**: `src/services/MetadataService.js` or `src/utils/titleFormatter.js` - `formatTitle()`

**Algorithm**:
1. Trim whitespace
2. Convert to lowercase
3. Replace spaces with underscores
4. Remove invalid characters (keep only alphanumeric, underscore, dash)
5. Collapse multiple underscores to single
6. Remove leading/trailing underscores
7. Truncate to 100 characters (filesystem safety)
8. Handle empty result (use "untitled")

**Implementation**:
```javascript
function formatTitle(title) {
  if (!title || title.trim().length === 0) {
    return 'untitled';
  }

  let formatted = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')              // Spaces to underscores
    .replace(/[^a-z0-9_-]+/g, '_')     // Remove invalid chars
    .replace(/_+/g, '_')               // Collapse underscores
    .replace(/^_|_$/g, '');            // Trim underscores

  // Truncate to 100 characters
  if (formatted.length > 100) {
    formatted = formatted.substring(0, 100);
  }

  // Fallback if empty after sanitization
  if (formatted.length === 0) {
    return 'untitled';
  }

  return formatted;
}
```

**Examples**:
```javascript
Input: "How to Build REST APIs - Complete Tutorial"
Output: "how_to_build_rest_apis_complete_tutorial"

Input: "Python Tutorial #1 (Beginner)"
Output: "python_tutorial_1_beginner"

Input: "C++ Programming"
Output: "c_programming"

Input: "   Multiple    Spaces   "
Output: "multiple_spaces"

Input: "Unknown Title"
Output: "unknown_title"
```

### Short URL Building

The system generates a standardized short URL for the video.

**Code Reference**: `src/utils/urlShortener.js` - `buildShortUrl()`

**Template**: `https://youtu.be/{videoId}`

**Implementation**:
```javascript
function buildShortUrl(videoId) {
  // Validate video ID format
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new Error(`Invalid video ID format: ${videoId}`);
  }

  return `https://youtu.be/${videoId}`;
}
```

**Example**:
```javascript
Input: "dQw4w9WgXcQ"
Output: "https://youtu.be/dQw4w9WgXcQ"
```

### Metadata Header Building

The system constructs a metadata header for the transcript file.

**Code Reference**: `src/services/MetadataService.js` - `buildMetadataHeader()`

**Template**:
```
Channel: {channel}
Title: {title}
Youtube ID: {videoId}
URL: {shortUrl}
```

**Implementation**:
```javascript
function buildMetadataHeader(metadata, videoId) {
  const shortUrl = this.buildShortUrl(videoId);

  return [
    `Channel: ${metadata.channel}`,
    `Title: ${metadata.title}`,
    `Youtube ID: ${videoId}`,
    `URL: ${shortUrl}`
  ].join('\n');
}
```

**Example Output**:
```
Channel: JavaScript Mastery
Title: How to Build REST APIs - Complete Tutorial
Youtube ID: dQw4w9WgXcQ
URL: https://youtu.be/dQw4w9WgXcQ
```

**Field Preservation**:
- `Channel`: Preserved as-is from API (or "Unknown Channel")
- `Title`: Original unmodified title (or "Unknown Title")
- `Youtube ID`: Video identifier
- `URL`: Standardized short format

## Stage 5: Transcript Storage

After successfully fetching a transcript from the API, it must be persisted to disk immediately (FR-2.3).

### Atomic Write Process

To ensure crash resilience (FR-9.2), the system uses atomic writes:

**Steps**:
1. Write to temporary file: `~/.transcriptor/transcripts/{videoId}.md.tmp`
2. Rename to final file: `~/.transcriptor/transcripts/{videoId}.md`
3. Verify file exists

**Why Atomic?**: If the process crashes during step 1, the temporary file remains but the final file is untouched. On re-run, the cache check fails (file doesn't exist) and the fetch happens again. This prevents corrupted partial files.

**Code Reference**: `src/services/StorageService.js` - `saveTranscript()`

**Implementation**:
```javascript
async function saveTranscript(videoId, formattedTitle, content) {
  const filename = `${videoId}_${formattedTitle}.md`;
  const transcriptPath = path.join(
    this.paths.getTranscriptsPath(),
    filename
  );
  const tempPath = `${transcriptPath}.tmp`;

  try {
    // Step 1: Write to temporary file
    await fs.writeFile(tempPath, content, 'utf8');

    // Step 2: Rename to final (atomic operation)
    await fs.rename(tempPath, transcriptPath);

    // Step 3: Verify
    const exists = await fs.pathExists(transcriptPath);
    if (!exists) {
      throw new Error('Transcript file verification failed');
    }

    console.log(`[StorageService] Saved transcript: ${filename}`);
  } catch (error) {
    // Cleanup temporary file if it exists
    await fs.remove(tempPath).catch(() => {});
    throw error;
  }
}
```

### Storage Location

**Path**: `~/.transcriptor/transcripts/{videoId}_{formattedTitle}.md`

**Path Resolution**:
- `~` expands to user home directory (cross-platform)
  - macOS/Linux: `/Users/username/.transcriptor/transcripts/`
  - Windows: `C:\Users\username\.transcriptor\transcripts\`

**Code Reference**: `src/utils/pathResolver.js` - `getTranscriptsPath()`

### Content Stored

**Format**: Metadata header + plain text transcript
**Structure**: Metadata section (4 lines) + blank line + transcript text
**Encoding**: UTF-8

**Example File Content** (`~/.transcriptor/transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md`):
```
Channel: JavaScript Mastery
Title: How to Build REST APIs - Complete Tutorial
Youtube ID: dQw4w9WgXcQ
URL: https://youtu.be/dQw4w9WgXcQ

Hello and welcome to this video tutorial. Today we're going to learn about JavaScript promises and async await patterns. Let's start with the basics of asynchronous programming.

First, let's understand what a promise is. A promise is an object that represents the eventual completion or failure of an asynchronous operation. It allows you to write asynchronous code in a more synchronous fashion.
```

**Content Composition**:
1. **Metadata header** (from Stage 4):
   - Channel: {channel name}
   - Title: {original title}
   - Youtube ID: {videoId}
   - URL: {short URL}
2. **Blank line separator**
3. **Transcript text**: `transcript_only_text` field from API response as-is

### Size Validation

Before saving, the system validates transcript size per TR specifications:

**Maximum Size**: 10MB (10,485,760 bytes)

```javascript
const sizeBytes = Buffer.byteLength(content, 'utf8');
if (sizeBytes > 10 * 1024 * 1024) {
  throw new Error(`Transcript exceeds 10MB limit: ${sizeBytes} bytes`);
}
```

Files exceeding this limit are rejected and logged as errors.

### Crash Resilience Example

**Scenario**: Process crashes after API fetch but before file write completes

**State**:
- API returned transcript and metadata
- Temporary file may partially exist: `dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md.tmp`
- Final file does not exist: `dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md`
- Registry not updated

**Recovery**: User re-runs `transcriptor`
1. Cache check: Registry entry missing → cache miss
2. File check: File doesn't exist → cache miss
3. API fetch: Fetch transcript and metadata again (idempotent operations)
4. Format title and build header
5. Save: Complete atomic write successfully with header
6. Registry update: Add entry to data.json with metadata

**Result**: No data loss, system recovers automatically

## Stage 6: Registry Update

After saving the transcript file, the system updates the metadata registry to track the transcript's existence and link locations.

### Registry Entry Creation

**Code Reference**: `src/services/StorageService.js` - `updateRegistry()` (internal method)

**Entry Structure**:
```javascript
{
  "videoId": {
    "date_added": "YYYY-MM-DD",
    "channel": "Channel Name",
    "title": "Original Video Title",
    "links": []
  }
}
```

**Date Format**: ISO 8601 date-only format (`YYYY-MM-DD`)

**Example**:
```json
{
  "dQw4w9WgXcQ": {
    "date_added": "2025-11-19",
    "channel": "JavaScript Mastery",
    "title": "How to Build REST APIs - Complete Tutorial",
    "links": []
  }
}
```

### Registry Update Process

```javascript
async function updateRegistry(videoId, metadata) {
  // 1. Load current registry
  const registry = await this.loadRegistry();

  // 2. Check if entry already exists
  if (!registry[videoId]) {
    // 3. Create new entry with current date and metadata
    registry[videoId] = {
      date_added: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      channel: metadata.channel,
      title: metadata.title,
      links: []
    };
  }
  // If entry exists, preserve existing date_added, metadata, and links

  // 4. Save updated registry atomically
  await this.saveRegistry(registry);
}
```

### Atomic Registry Write

Registry persistence uses the same atomic write pattern as transcripts (TR-8):

**Code Reference**: `src/services/StorageService.js` - `saveRegistry()`

```javascript
async function saveRegistry(registry) {
  const registryPath = this.paths.getRegistryPath(); // ~/.transcriptor/data.json
  const tempPath = `${registryPath}.tmp`;

  try {
    // Step 1: Validate structure before writing
    if (!this.isValidRegistryStructure(registry)) {
      throw new Error('Invalid registry structure');
    }

    // Step 2: Write to temporary file
    const content = JSON.stringify(registry, null, 2); // 2-space indentation
    await fs.writeFile(tempPath, content, 'utf8');

    // Step 3: Rename to final (atomic)
    await fs.rename(tempPath, registryPath);

    console.log('[StorageService] Registry updated');
  } catch (error) {
    // Cleanup temp file on failure
    await fs.remove(tempPath).catch(() => {});
    throw error;
  }
}
```

### Registry Validation

Before writing, the registry structure is validated:

**Validation Rules**:
- Must be an object (not array or primitive)
- Each entry must have exactly four keys: `date_added`, `channel`, `title`, `links`
- `date_added` must match `YYYY-MM-DD` format
- `channel` must be a non-empty string
- `title` must be a non-empty string
- `links` must be an array

**Code Reference**: `src/services/StorageService.js` - `isValidRegistryStructure()`

```javascript
function isValidRegistryStructure(data) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return false;
  }

  for (const videoId in data) {
    const entry = data[videoId];

    // Check required keys
    const keys = Object.keys(entry);
    const requiredKeys = ['date_added', 'channel', 'title', 'links'];
    if (keys.length !== 4 || !requiredKeys.every(key => keys.includes(key))) {
      return false;
    }

    // Validate date_added format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date_added)) {
      return false;
    }

    // Validate channel is non-empty string
    if (typeof entry.channel !== 'string' || entry.channel.length === 0) {
      return false;
    }

    // Validate title is non-empty string
    if (typeof entry.title !== 'string' || entry.title.length === 0) {
      return false;
    }

    // Validate links is array
    if (!Array.isArray(entry.links)) {
      return false;
    }
  }

  return true;
}
```

### Error Recovery

If registry write fails:

**Behavior**:
- Log error: `"[StorageService] Failed to update registry: {error}"`
- Transcript file remains on disk (already saved in Stage 4)
- Continue processing (don't exit)
- On next run, auto-maintenance detects orphaned file and adds to registry (future enhancement)

**Result**: Data is not lost, system self-heals on subsequent runs

## Stage 7: Link Creation

After transcript storage and registry update, the system creates a symbolic link in the project-local directory.

### Project-Local Directory

**Location**: `./transcripts/` in current working directory

**Creation**: Automatically created if missing

```javascript
const localDir = path.resolve('./transcripts');
await fs.ensureDir(localDir); // Create if doesn't exist
```

### Symbolic Link Creation

**Source** (target of link): `~/.transcriptor/transcripts/{videoId}_{formattedTitle}.md`
**Destination** (link location): `./transcripts/{videoId}_{formattedTitle}.md`
**Type**: Symbolic link (symlink)
**Filename**: Built from video ID and formatted title

**Code Reference**: `src/services/LinkManager.js` - `createLink()`

```javascript
async function createLink(videoId, formattedTitle) {
  const filename = `${videoId}_${formattedTitle}.md`;
  const sourcePath = path.join(
    this.pathResolver.getTranscriptsPath(),
    filename
  );
  const linkPath = path.join(
    this.pathResolver.getLocalTranscriptsPath(),
    filename
  );

  // Ensure local directory exists
  await fs.ensureDir(path.dirname(linkPath));

  // Create symbolic link (force = overwrite if exists)
  await fs.symlink(sourcePath, linkPath, 'file');

  console.log(`[LinkManager] Created link: ${filename}`);

  // Track link in registry
  await this._trackLink(videoId, linkPath);
}
```

### Link Tracking in Registry

After creating the link, its path is added to the registry entry's `links` array:

```javascript
async function _trackLink(videoId, linkPath) {
  // 1. Load registry
  const registry = await this.storage.loadRegistry();

  // 2. Get entry (should exist from Stage 5)
  if (!registry[videoId]) {
    registry[videoId] = {
      date_added: new Date().toISOString().split('T')[0],
      links: []
    };
  }

  // 3. Add link path if not already tracked
  const absoluteLinkPath = path.resolve(linkPath);
  if (!registry[videoId].links.includes(absoluteLinkPath)) {
    registry[videoId].links.push(absoluteLinkPath);
  }

  // 4. Save registry atomically
  await this.storage.saveRegistry(registry);
}
```

**Example Registry After Link Tracking**:
```json
{
  "dQw4w9WgXcQ": {
    "date_added": "2025-11-19",
    "channel": "JavaScript Mastery",
    "title": "How to Build REST APIs - Complete Tutorial",
    "links": [
      "/Users/developer/project1/transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md"
    ]
  }
}
```

If the same video is processed from a different project:
```json
{
  "dQw4w9WgXcQ": {
    "date_added": "2025-11-19",
    "channel": "JavaScript Mastery",
    "title": "How to Build REST APIs - Complete Tutorial",
    "links": [
      "/Users/developer/project1/transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md",
      "/Users/developer/project2/transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md"
    ]
  }
}
```

### Overwrite Behavior

If a link already exists at `./transcripts/{videoId}_{formattedTitle}.md`, it is overwritten:

**Reason**: Ensures link points to correct source even if source path changed

**Implementation**: `fs.symlink()` with force option handles this automatically in recent fs-extra versions, or by removing existing link first:

```javascript
// Remove existing link if present
if (await fs.pathExists(linkPath)) {
  await fs.unlink(linkPath);
}

// Create new link
await fs.symlink(sourcePath, linkPath, 'file');
```

### Cross-Platform Compatibility

**macOS/Linux**: Standard symlink operations work directly

**Windows**: Requires proper path handling
- Use absolute paths for source and destination
- Ensure source path exists before creating link
- May require administrator privileges depending on Windows version

**Code Reference**: `src/utils/pathResolver.js` handles cross-platform paths

### Error Handling

If link creation fails:

**Behavior**:
- Log error: `"[LinkManager] Failed to create link for {videoId}: {error}"`
- Track failure in statistics: `this.stats.linksFailed++`
- Continue processing (don't exit)
- Transcript remains in central storage (accessible manually)

**Common Errors**:
- `EEXIST`: Link already exists (handled by overwrite)
- `EACCES`: Permission denied (log and continue)
- `ENOENT`: Source file missing (indicates earlier failure)

## Stage 8: Batch Processing & Summary

The system processes multiple URLs sequentially, isolating errors and tracking statistics.

### Sequential Processing

**Code Reference**: `src/services/TranscriptService.js` - `processBatch()`

```javascript
async function processBatch(urls) {
  const results = [];

  // Process URLs one at a time (sequential)
  for (const url of urls) {
    try {
      const result = await this.processVideo(videoId, url);
      results.push(result);
    } catch (error) {
      // Log error but continue with next URL
      console.error(`[TranscriptService] Error processing ${url}: ${error.message}`);
      results.push({
        success: false,
        videoId: videoId,
        error: error.message
      });
    }
  }

  return results;
}
```

### Error Isolation

**Per FR-10.1**: If one URL fails, continue processing remaining URLs

**Examples**:

**Scenario 1: Invalid URL**
```
[TranscriptService] Processing video: dQw4w9WgXcQ
[TranscriptService] Success: dQw4w9WgXcQ (from cache)
[TranscriptService] Invalid YouTube URL format - Skipping
[TranscriptService] Processing video: jNQXAC9IVRw
[TranscriptService] Success: jNQXAC9IVRw (fetched from API)
```

**Scenario 2: API Error**
```
[TranscriptService] Processing video: abc123defgh
[APIClient] Error: Invalid URL (400) - Skipping
[TranscriptService] Error processing abc123defgh: Invalid URL
[TranscriptService] Processing video: xyz789mnopq
[TranscriptService] Success: xyz789mnopq (fetched from API)
```

### Statistics Tracked

Throughout processing, the system maintains counters:

```javascript
{
  totalProcessed: 10,      // Total URLs attempted
  successCount: 8,         // Successful transcripts
  cacheHits: 5,            // Retrieved from cache
  newFetches: 3,           // Fetched from API
  failedCount: 2,          // Errors (invalid URL, API failure, etc.)
  linksCreated: 8,         // Symbolic links created
  linksFailed: 0,          // Link creation failures
  duration: 12345          // Total processing time (ms)
}
```

### Summary Display

After processing completes, a summary is displayed:

**Code Reference**: `src/commands/process.js`

**Example Output**:
```
=================================================
  Transcript Processing Complete
=================================================

Total URLs: 10
Successful: 8 transcripts
  - From cache: 5
  - Newly fetched: 3
Failed: 2 URLs

Symbolic links created: 8
Processing time: 12.3 seconds

Transcripts available in ./transcripts/
=================================================
```

### Result Object Structure

Each processed video returns a result object:

**Success Result**:
```javascript
{
  success: true,
  videoId: "dQw4w9WgXcQ",
  source: "cache",  // or "api"
  cached: true,     // or false
  linkCreated: true,
  error: null
}
```

**Error Result**:
```javascript
{
  success: false,
  videoId: "abc123defgh",
  source: "error",
  cached: false,
  linkCreated: false,
  error: "Invalid YouTube URL (400)"
}
```

**Code Reference**: `src/utils/ResultFactory.js` - `createSuccess()`, `createError()`

## Crash Recovery Scenarios

### Scenario 1: Crash After Transcript Saved, Before Registry Update

**State**:
- Transcript file exists: `~/.transcriptor/transcripts/dQw4w9WgXcQ.md` ✓
- Registry entry missing: `data.json` has no entry for `dQw4w9WgXcQ` ✗
- Link not created: `./transcripts/dQw4w9WgXcQ.md` ✗

**Recovery on Re-run**:
1. Auto-maintenance runs before processing (FR-7.1)
2. Validates integrity: Finds transcript file with no registry entry
3. Option A (current): Removes orphaned file
4. Option B (future enhancement): Adds entry to registry with current date
5. Processing proceeds normally

**Alternate Recovery** (manual):
- User can manually add entry to data.json
- Or, re-run transcriptor (will fetch again from API, overwriting file)

### Scenario 2: Crash During Registry Write

**State**:
- Transcript file exists: `~/.transcriptor/transcripts/dQw4w9WgXcQ.md` ✓
- Registry temp file exists: `~/.transcriptor/data.json.tmp` (partial/complete)
- Registry final file: `~/.transcriptor/data.json` (old state, no new entry)
- Link not created: `./transcripts/dQw4w9WgXcQ.md` ✗

**Recovery on Re-run**:
1. Load registry: Reads `data.json` (old state, atomic rename never completed)
2. Temp file ignored and will be cleaned up on next write
3. Cache check fails (no registry entry)
4. API fetch: Fetches transcript again (idempotent)
5. Save transcript: Overwrites existing file (idempotent)
6. Registry update: Completes successfully this time

**Result**: No data corruption, system recovers automatically

### Scenario 3: Crash After Link Creation, Before Link Tracking

**State**:
- Transcript file exists: `~/.transcriptor/transcripts/dQw4w9WgXcQ.md` ✓
- Registry entry exists: With `date_added` but empty `links` array ✓
- Link exists: `./transcripts/dQw4w9WgXcQ.md` ✓ (but not tracked)

**Recovery on Re-run**:
1. Cache check: Succeeds (registry entry + file exist)
2. Load transcript from cache
3. Create link: Attempts to create link (already exists, overwrite)
4. Track link: Adds path to `links` array in registry
5. Save registry: Persists updated `links` array

**Result**: Link is properly tracked on re-run, no data loss

## Cleanup Data Flow

The `transcriptor clean YYYY-MM-DD` command removes old transcripts.

### Cleanup Workflow

**Code Reference**: `src/commands/clean.js`

**Steps**:

1. **Validate Date**:
```javascript
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
if (!dateRegex.test(dateArg)) {
  console.error('Invalid date format. Use YYYY-MM-DD');
  process.exit(1);
}
```

2. **Load Registry**:
```javascript
const registry = await storageService.loadRegistry();
```

3. **Filter Entries** (older than date, exclusive):
```javascript
const cutoffDate = new Date(dateArg);
const toDelete = [];

for (const videoId in registry) {
  const entry = registry[videoId];
  const entryDate = new Date(entry.date_added);

  if (entryDate < cutoffDate) {  // Exclusive comparison
    toDelete.push(videoId);
  }
}
```

**Exclusive Boundary**: Videos added on the specified date are **not** deleted

4. **Delete Each Entry**:
```javascript
for (const videoId of toDelete) {
  // Delete all tracked symbolic links
  await linkManager.removeAllLinks(videoId);

  // Delete transcript file
  await storageService.deleteTranscript(videoId);

  // Remove from registry
  delete registry[videoId];
}
```

5. **Save Updated Registry**:
```javascript
await storageService.saveRegistry(registry);
console.log(`Deleted ${toDelete.length} transcripts`);
```

### Link Deletion Process

**Code Reference**: `src/services/LinkManager.js` - `removeAllLinks()`

```javascript
async function removeAllLinks(videoId) {
  const registry = await this.storage.loadRegistry();
  const entry = registry[videoId];

  if (!entry || !entry.links) {
    return; // No links to delete
  }

  // Delete each link
  for (const linkPath of entry.links) {
    try {
      await fs.unlink(linkPath);
      console.log(`[LinkManager] Deleted link: ${linkPath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Link already gone - idempotent
        console.log(`[LinkManager] Link not found (already deleted): ${linkPath}`);
      } else {
        // Log but continue
        console.error(`[LinkManager] Failed to delete link ${linkPath}: ${error.message}`);
      }
    }
  }

  // Clear links array in registry entry
  entry.links = [];
}
```

### Error Handling During Cleanup

**Missing Links** (ENOENT):
- Skipped silently (idempotent operation)
- Link may have been manually deleted

**Missing Transcript File**:
- Logged as warning
- Registry entry still removed (cleanup completes)

**Permission Errors**:
- Logged as error
- Continue with remaining deletions
- Partial cleanup may result (some files deleted, others remain)

### Example Cleanup Operation

**Before Cleanup**:
```json
// data.json
{
  "video1": {
    "date_added": "2025-11-01",
    "channel": "Channel A",
    "title": "Old Video",
    "links": ["/project1/transcripts/video1_old_video.md"]
  },
  "video2": {
    "date_added": "2025-11-15",
    "channel": "Channel B",
    "title": "Recent Video",
    "links": ["/project1/transcripts/video2_recent_video.md"]
  },
  "video3": {
    "date_added": "2025-11-20",
    "channel": "Channel C",
    "title": "New Video",
    "links": ["/project1/transcripts/video3_new_video.md"]
  }
}
```

**Command**: `transcriptor clean 2025-11-15`

**After Cleanup**:
```json
// data.json
{
  "video2": {
    "date_added": "2025-11-15",
    "channel": "Channel B",
    "title": "Recent Video",
    "links": ["/project1/transcripts/video2_recent_video.md"]
  },
  "video3": {
    "date_added": "2025-11-20",
    "channel": "Channel C",
    "title": "New Video",
    "links": ["/project1/transcripts/video3_new_video.md"]
  }
}
```

**Files Deleted**:
- `~/.transcriptor/transcripts/video1_old_video.md` ✓
- `/project1/transcripts/video1_old_video.md` (symlink) ✓

**Files Kept**:
- `~/.transcriptor/transcripts/video2_recent_video.md` (date matches boundary)
- `~/.transcriptor/transcripts/video3_new_video.md` (newer than boundary)

## Auto-Maintenance Flow

Before each processing run, the system validates data integrity.

### Integrity Validation Workflow

**Code Reference**: `src/services/MaintenanceService.js` - `validateIntegrity()`

**Trigger**: Before processing URLs in `transcriptor` command

**Steps**:

1. **Load Registry**:
```javascript
const registry = await this.storage.loadRegistry();
```

2. **Check Each Entry**:
```javascript
for (const videoId in registry) {
  const fileExists = await this.storage.transcriptExists(videoId);

  if (!fileExists) {
    // Orphaned entry - file missing
    await this._removeOrphanedEntry(videoId);
  }
}
```

3. **Remove Orphaned Entry**:
```javascript
async function _removeOrphanedEntry(videoId) {
  console.log(`[Maintenance] Orphaned entry detected: ${videoId} - Removing`);

  const registry = await this.storage.loadRegistry();
  const entry = registry[videoId];

  // Delete all tracked links
  if (entry && entry.links) {
    for (const linkPath of entry.links) {
      await fs.unlink(linkPath).catch(() => {}); // Ignore errors
    }
  }

  // Remove from registry
  delete registry[videoId];
  await this.storage.saveRegistry(registry);
}
```

### Common Orphan Scenarios

**Scenario 1**: Manual file deletion
- User manually deletes `~/.transcriptor/transcripts/video1.md`
- Registry still has entry for `video1`
- Auto-maintenance detects and removes entry

**Scenario 2**: Crash during write
- Process crashes after partial file write
- Atomic write means final file doesn't exist
- Auto-maintenance removes incomplete entry

**Scenario 3**: External tool cleanup
- External script deletes old transcript files
- Registry becomes out of sync
- Auto-maintenance synchronizes state

## Data Transformation Examples

### Example 1: Complete Flow for New Video

**Input**: `youtube.md` contains `https://www.youtube.com/watch?v=dQw4w9WgXcQ`

**Stage 1 Output**: Video ID `dQw4w9WgXcQ`

**Stage 2 Output**: Cache miss (no registry entry, no file)

**Stage 3 Output**:
- Transcript text: `"Hello and welcome to this video tutorial..."`
- Metadata: `{channel: "JavaScript Mastery", title: "How to Build REST APIs - Complete Tutorial"}`

**Stage 4 Output**:
- Formatted title: `"how_to_build_rest_apis_complete_tutorial"`
- Metadata header:
```
Channel: JavaScript Mastery
Title: How to Build REST APIs - Complete Tutorial
Youtube ID: dQw4w9WgXcQ
URL: https://youtu.be/dQw4w9WgXcQ
```

**Stage 5 Output**: File created at `~/.transcriptor/transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md`:
```
Channel: JavaScript Mastery
Title: How to Build REST APIs - Complete Tutorial
Youtube ID: dQw4w9WgXcQ
URL: https://youtu.be/dQw4w9WgXcQ

Hello and welcome to this video tutorial...
```

**Stage 6 Output**: Registry updated:
```json
{
  "dQw4w9WgXcQ": {
    "date_added": "2025-11-19",
    "channel": "JavaScript Mastery",
    "title": "How to Build REST APIs - Complete Tutorial",
    "links": []
  }
}
```

**Stage 7 Output**:
- Link created: `./transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md` → `~/.transcriptor/transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md`
- Registry updated:
```json
{
  "dQw4w9WgXcQ": {
    "date_added": "2025-11-19",
    "channel": "JavaScript Mastery",
    "title": "How to Build REST APIs - Complete Tutorial",
    "links": ["/Users/developer/project1/transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md"]
  }
}
```

**Stage 8 Output**: Summary report showing 1 success, 0 cached, 1 new fetch

### Example 2: Complete Flow for Cached Video

**Input**: `youtube.md` contains `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (already processed)

**Stage 1 Output**: Video ID `dQw4w9WgXcQ`

**Stage 2 Output**: Cache hit (registry entry exists, file exists)

**Stage 3**: Skipped (cache hit)

**Stage 4**: Skipped (cache hit)

**Stage 5**: Skipped (cache hit)

**Stage 6**: Skipped (entry already exists)

**Stage 7 Output**:
- Link created (or verified): `./transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md`
- Registry updated (link path added if not already tracked):
```json
{
  "dQw4w9WgXcQ": {
    "date_added": "2025-11-19",
    "channel": "JavaScript Mastery",
    "title": "How to Build REST APIs - Complete Tutorial",
    "links": [
      "/Users/developer/project1/transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md",
      "/Users/developer/project2/transcripts/dQw4w9WgXcQ_how_to_build_rest_apis_complete_tutorial.md"
    ]
  }
}
```

**Stage 8 Output**: Summary report showing 1 success, 1 cached, 0 new fetches

## References

- **Implementation Files**:
  - Workflow Orchestration: `src/services/TranscriptService.js`
  - Storage Operations: `src/services/StorageService.js`
  - API Integration: `src/services/APIClient.js`
  - Metadata Operations: `src/services/MetadataService.js`
  - Link Management: `src/services/LinkManager.js`
  - Auto-Maintenance: `src/services/MaintenanceService.js`
  - Title Formatting: `src/utils/titleFormatter.js`
  - URL Shortening: `src/utils/urlShortener.js`
  - Process Command: `src/commands/process.js`

- **Related Documentation**:
  - API Integration Details: `docs/API_INTEGRATION.md`
  - System Architecture: `docs/ARCHITECTURE.md`
  - Contribution Guidelines: `docs/CONTRIBUTING.md`

- **Requirements**:
  - Functional Requirements: FR-1 through FR-11
  - Technical Requirements: TR-1 through TR-29
  - Business Rules: BR-1 through BR-4
