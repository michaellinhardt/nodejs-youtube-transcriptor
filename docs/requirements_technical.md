# Technical Requirements

## Testing Policy

This project will NOT include tests. The project scope is too small to warrant testing infrastructure, frameworks, or test coverage requirements.

## Technology Stack

### Core Platform

```yaml
Runtime: Node.js v18+
Package: npm global CLI
Installation: npm link
Entry: bin/transcriptor
```

### Dependencies

```yaml
Required:
  commander: ^12.0.0 # CLI framework
  axios: ^1.7.0 # HTTP client
  fs-extra: ^11.0.0 # File operations
  dotenv: ^16.0.0 # Environment vars
```

## Architecture

### Module Structure

```yaml
Structure:
  bin/transcriptor: CLI entry point
  src/index.js: Command router
  src/commands/: Command handlers
  src/services/: Business logic
  src/utils/: Shared utilities
```

### Component Boundaries

```yaml
CommandHandler:
  type: module
  tech: [commander]
  interfaces: [process, help, data, clean]
  dependencies: [TranscriptService, StorageService]

TranscriptService:
  type: service
  tech: [axios]
  interfaces: [fetchTranscript, fetchMetadata, checkCache]
  dependencies: [StorageService, APIClient, MetadataService]

MetadataService:
  type: service
  tech: [axios]
  interfaces: [fetchVideoMetadata, formatTitle, buildShortUrl]
  dependencies: [none]

StorageService:
  type: service
  tech: [fs-extra]
  interfaces: [read, write, link, delete]
  dependencies: [PathResolver]
```

## Data Models

### Registry Schema

```yaml
DataRegistry:
  videoId:
    date_added: string|YYYY-MM-DD
    channel: string|author_name
    title: string|original_video_title
    links: array<string>|absolute_paths

RegistryValidation:
  allowed_keys: [date_added, channel, title, links]
  date_added: required|string|match(/^\d{4}-\d{2}-\d{2}$/)
  channel: required|string|min_length(1)
  title: required|string|min_length(1)
  links: required|array|each(absolute_path)
```

### File Structure

```yaml
Storage:
  ~/.transcriptor/:
    data.json: registry
    transcripts/:
      {videoId}_{formattedTitle}.md: content
```

### Transcript File Format

```yaml
TranscriptFile:
  structure:
    - metadata_section
    - blank_line
    - transcript_text
  metadata_section:
    - "Channel: {channel_name}"
    - "Title: {original_video_title}"
    - "Youtube ID: {video_id}"
    - "URL: {standard_short_url}"
  separator: "\n\n"
  encoding: utf-8
```

## API Integration

### Scrape Creators API

```yaml
Endpoint: POST https://api.scrape-creators.com/transcript
Headers:
  x-api-key: { SCRAPE_CREATORS_API_KEY }
Request:
  url: string|youtube_url
Response:
  transcript_only_text: string
Errors: [400, 401, 429, 500]
Rate: 100/min
Timeout: 30s
```

### YouTube oEmbed API

```yaml
Endpoint: GET https://www.youtube.com/oembed
Protocol: HTTPS|no_auth_required
Request:
  url: string|youtube_url_encoded
  format: json
Response:
  title: string|original_video_title
  author_name: string|channel_name
  provider_name: string # "YouTube"
  type: string # "video"
Errors: [400, 404, 500]
Timeout: 15s
Retry: none # Metadata non-critical
Fallback: use_placeholder_values
```

## Command Specifications

### TR-1: Main Command (implements FR-1, FR-8)

```yaml
Command: transcriptor
Input: ./youtube.md
Process:
  - validateFile() → boolean
  - parseURLs() → videoIds[]
  - forEach(processVideo)
Output: ./transcripts/*.md
Error: display_help
```

### TR-2: Help Command (implements FR-8.2)

```yaml
Command: transcriptor help
Output: usage_text
```

### TR-3: Data Command (implements FR-5.1)

```yaml
Command: transcriptor data
Process:
  - loadRegistry() → data
  - calculateStats() → metrics
Output:
  total: number
  size: string|MB
  oldest: string|YYYY-MM-DD
  newest: string|YYYY-MM-DD
  per_entry:
    - videoId: string
    - channel: string
    - title: string
    - date_added: YYYY-MM-DD
    - link_count: number
```

### TR-4: Clean Command (implements FR-6)

```yaml
Command: transcriptor clean {date}
Input: YYYY-MM-DD
Process:
  - filterOlder(date, exclusive=true)
  - forEach(removeEntry)
Output: deleted_count
```

## Processing Algorithms

### TR-5: URL Processing (implements FR-1.1)

```yaml
ParseURLs:
  input: file_content
  regex: /(?:youtu\.be\/|youtube\.com\/watch\?v=)([^&\s]+)/
  extract: group[1] → videoId
  validate: length=11, alphanumeric+dash
  output: videoId[]
```

### TR-6: Cache Check (implements FR-2.2)

```yaml
CheckCache:
  input: videoId
  check: registry[videoId] exists
  return: boolean
```

### TR-7: Transcript Processing (implements FR-2)

```yaml
ProcessVideo:
  input: videoId
  steps:
    - checkCache() → exists
    - if(!exists): fetchAPI()
    - saveTranscript()
    - createLink()
    - updateRegistry()
    - persistRegistry()
```

## File Operations

### TR-8: Atomic Write (implements FR-9.1)

```yaml
AtomicWrite:
  path: target_file
  process:
    - write(path + '.tmp', content)
    - rename(path + '.tmp', path)
  rollback: delete('.tmp')
```

### TR-9: Link Creation (implements FR-4)

```yaml
CreateLink:
  source: ~/.transcriptor/transcripts/{id}_{formattedTitle}.md
  target: ./transcripts/{id}_{formattedTitle}.md
  type: symbolic
  force: true
  track: registry[id].links.push(cwd)
  filename: build_from_registry_metadata
```

## Path Management

### TR-10: Cross-Platform Paths

```yaml
PathResolver:
  home: process.env.HOME || process.env.USERPROFILE
  storage: path.join(home, '.transcriptor')
  transcripts: path.join(storage, 'transcripts')
  registry: path.join(storage, 'data.json')
  local: path.resolve('./transcripts')
```

## Utility Functions

### TR-26: Title Sanitization (implements FR-2.5)

```yaml
SanitizeTitle:
  input: title_string
  operations:
    - trim()
    - toLowerCase()
    - replace(/\s+/g, '_')
    - replace(/[^a-z0-9_-]+/g, '_')
    - replace(/_+/g, '_')
    - replace(/^_|_$/g, '')
    - truncate(100)
  fallbacks:
    empty_result: "untitled"
    null_input: "untitled"
  validation:
    output_pattern: /^[a-z0-9][a-z0-9_-]*$/
  examples:
    - in: "How to Build REST APIs"
      out: "how_to_build_rest_apis"
    - in: "C++ Programming Tutorial #1"
      out: "c_programming_tutorial_1"
    - in: "   Multiple    Spaces   "
      out: "multiple_spaces"
```

### TR-27: Metadata Header Builder (implements FR-11)

```yaml
BuildMetadataHeader:
  input:
    channel: string
    title: string
    videoId: string
  template: |
    Channel: {channel}
    Title: {title}
    Youtube ID: {videoId}
    URL: https://youtu.be/{videoId}
  validation:
    no_null_fields: true
    preserve_original_title: true
  output: string|multiline
```

### TR-28: URL Shortener (implements FR-3.3)

```yaml
BuildYoutubeShortUrl:
  input: videoId
  template: "https://youtu.be/{videoId}"
  validation:
    videoId: /^[a-zA-Z0-9_-]{11}$/
  output: "https://youtu.be/{videoId}"
```

## Environment Configuration

### TR-11: API Key Management (implements FR-2.1)

```yaml
Environment:
  file: .env
  vars:
    SCRAPE_CREATORS_API_KEY: required|string
  load: dotenv.config()
  validate: process.exit(1) if missing
```

## Error Handling

### TR-12: API Failures (implements FR-10)

```yaml
APIError:
  400: skip_url, log_invalid
  401: exit, display_key_error
  429: retry_exponential(3)
  500: skip_url, continue
  timeout: skip_url, continue
```

### TR-13: File System Errors

```yaml
FSError:
  ENOENT: create_if_missing
  EACCES: log_permission, skip
  EEXIST: overwrite_link
  EINVAL: skip_invalid_path
  ENAMETOOLONG: sanitize_filename, retry
```

### TR-29: Metadata Fetch Errors (implements FR-2.2)

```yaml
MetadataError:
  404: use_fallback, log_warning
  400: use_fallback, log_warning
  500: use_fallback, log_warning
  timeout: use_fallback, log_warning
  network: use_fallback, log_warning
  fallback_values:
    channel: "Unknown Channel"
    title: "Unknown Title"
  behavior: nonfatal # Transcript processing continues
```

## Maintenance Operations

### TR-14: Auto-Maintenance (implements FR-7)

```yaml
ValidateIntegrity:
  trigger: before_process
  check:
    - registry_entry → file_exists
    - if(!exists): removeEntry()
  cleanup:
    - delete_links(entry.links)
    - delete_file(transcript)
    - remove_registry_entry
    - save_registry()
```

### TR-15: Statistics Calculation (implements FR-5.1)

```yaml
CalculateStats:
  total: Object.keys(registry).length
  size: getFolderSize(storage_path)
  oldest: min(date_added)
  newest: max(date_added)
  format: humanReadable(bytes → MB)
  per_entry_display:
    - videoId
    - channel
    - title
    - date_added
    - links.length
```

## Performance Constraints

```yaml
Limits:
  max_concurrent: 1 # Sequential URL processing
  parallel_api_calls: 2 # Transcript + metadata per video
  file_size: 10MB # Max transcript size
  url_batch: 1000 # Max URLs per run
  transcript_api_timeout: 30s
  metadata_api_timeout: 15s
  retry_delay: [1s, 2s, 4s]
  filename_max_length: 255 # Filesystem limit

Optimization:
  parallel_fetch:
    - Promise.all([fetchTranscript(), fetchMetadata()])
  registry_caching: true
  metadata_nonfatal: true # Continue on metadata failure
```

## Security Mechanisms

```yaml
Security:
  api_key: env_only, never_logged
  paths: validate_traversal
  input: sanitize_video_id
  files: validate_extensions
  filename_sanitization:
    - strip_path_separators
    - remove_special_chars
    - enforce_max_length
    - prevent_hidden_files
  metadata_sanitization:
    - escape_control_chars
    - validate_string_length
    - prevent_injection
```

## Data Persistence

### TR-16: Registry Persistence (implements FR-9)

```yaml
SaveRegistry:
  trigger: after_each_operation
  format: JSON.stringify(data, null, 2)
  method: atomic_write
  backup: none # Immediate write strategy
```

### TR-17: Transcript Storage (implements FR-2.4, FR-11)

```yaml
SaveTranscript:
  path: ~/.transcriptor/transcripts/{id}_{formattedTitle}.md
  content: metadata_header + "\n\n" + transcript_text
  format: markdown
  encoding: utf-8
  metadata_header:
    - "Channel: {metadata.channel}"
    - "Title: {metadata.title}"
    - "Youtube ID: {videoId}"
    - "URL: {buildShortUrl(videoId)}"
```

## Metadata Collection

### TR-20: Video Metadata Acquisition (implements FR-2.2)

```yaml
FetchMetadata:
  input: videoId
  api: youtube_oembed
  url: "https://www.youtube.com/oembed?url=https://youtu.be/{videoId}&format=json"
  method: GET
  timeout: 15s
  retry: none
  extract:
    channel: response.author_name
    title: response.title
  fallback:
    channel: "Unknown Channel"
    title: "Unknown Title"
  error_handling:
    - 400|404: use_fallback, log_warning
    - 500: use_fallback, log_warning
    - timeout: use_fallback, log_warning
```

### TR-21: Title Formatting Utility (implements FR-2.5)

```yaml
FormatTitle:
  input: original_title
  algorithm:
    - trim_whitespace
    - convert_to_lowercase
    - replace_spaces_with_underscore
    - remove_invalid_chars
    - truncate_if_needed
  allowed_chars: /[a-z0-9_-]/
  regex_replacement: /[^a-z0-9_-]+/g → "_"
  max_length: 100 # Filesystem safety
  edge_cases:
    empty: "untitled"
    only_invalid: "video"
    consecutive_underscores: collapse_to_single
  examples:
    "My Video Title!" → "my_video_title"
    "Test  Multiple   Spaces" → "test_multiple_spaces"
    "Special@#$Chars" → "special_chars"
```

### TR-22: Short URL Builder (implements FR-3.3)

```yaml
BuildShortUrl:
  input: videoId
  format: "https://youtu.be/{videoId}"
  validation:
    - videoId: 11_chars, alphanumeric_dash
  output: string|valid_url
  no_encoding: true # videoId pre-validated
```

### TR-23: Updated File Naming (implements FR-2.4)

```yaml
BuildFilename:
  input:
    videoId: string
    title: string
  process:
    - formatted = formatTitle(title)
    - filename = "{videoId}_{formatted}.md"
  validation:
    - total_length < 255 # Filesystem limit
    - no_path_separators
  output: "{videoId}_{formattedTitle}.md"
```

### TR-24: Registry Update with Metadata (implements FR-3.2)

```yaml
UpdateRegistry:
  input:
    videoId: string
    metadata:
      channel: string
      title: string
    linkPath: string
  operation:
    - load_registry
    - update_or_create_entry:
        date_added: existing || current_date
        channel: metadata.channel
        title: metadata.title
        links: append_unique(linkPath)
    - validate_schema
    - atomic_write
  schema_validation:
    - required_keys: [date_added, channel, title, links]
    - date_added: YYYY-MM-DD
    - channel: non_empty_string
    - title: non_empty_string
    - links: array<absolute_path>
```

### TR-25: Transcript Processing Workflow (implements FR-2, TR-7)

```yaml
ProcessVideoWithMetadata:
  input:
    videoId: string
    videoUrl: string
  steps:
    - check_cache → cached
    - if(!cached):
        - fetch_transcript_parallel:
            - transcript ← api.fetchTranscript(url)
            - metadata ← api.fetchMetadata(videoId)
        - format_metadata_header(metadata, videoId)
        - build_filename(videoId, metadata.title)
        - save_transcript_with_header(filename, header, transcript)
        - update_registry(videoId, metadata, currentDir)
        - persist_registry
    - create_link(videoId, metadata.title)
  parallel_fetch: true # Transcript + metadata concurrent
  error_isolation: metadata_failure_nonfatal
```

## Command Routing

### TR-18: CLI Entry Point

```yaml
Router:
  default: process_command
  help: show_usage
  data: show_stats
  clean: clean_old
  invalid: show_usage
```

## Initialization

### TR-19: Setup Operations

```yaml
Initialize:
  ensure_directories:
    - ~/.transcriptor
    - ~/.transcriptor/transcripts
  ensure_files:
    - data.json: {}
  validate_env:
    - SCRAPE_CREATORS_API_KEY
```
