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
  interfaces: [fetchVideoMetadata, formatTitle, formatChannel, buildShortUrl]
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
    date_added: string|YYMMDDTHHMM
    channel: string|formatted_channel_name
    title: string|formatted_title

RegistryValidation:
  allowed_keys: [date_added, channel, title]
  date_added: required|string|match(/^\d{6}T\d{4}$/)
  channel: required|string|min_length(1)
  title: required|string|min_length(1)

DateFormat:
  pattern: YYMMDDTHHMM
  components:
    YY: year_2_digits
    MM: month_2_digits
    DD: day_2_digits
    T: literal_separator
    HH: hour_2_digits
    MM: minute_2_digits
  example: "251122T1430" # 2025-11-22 14:30
  cleanup_matching: use_YYMMDD_only # ignore THHMM
```

### File Structure

```yaml
Storage:
  ~/.transcriptor/:
    data.json: registry
    transcripts/:
      transcript_{videoId}_{formattedTitle}.md: content
  ./transcripts/:
    transcript_{videoId}_{formattedTitle}.md: symlink

FileNaming:
  pattern: "transcript_{videoId}_{formattedTitle}.md"
  applies_to:
    - ~/.transcriptor/transcripts/
    - ./transcripts/
  components:
    prefix: "transcript_"
    videoId: string|11_chars
    separator: "_"
    formattedTitle: sanitized_title|max_100_chars
    extension: ".md"
```

### Transcript File Format

```yaml
TranscriptFile:
  structure:
    - "# Transcript"
    - ""
    - "## Information"
    - ""
    - metadata_section
    - ""
    - "## Content"
    - ""
    - transcript_text
  metadata_section:
    - "Channel: {formatted_channel}"
    - "Title: {formatted_title}"
    - "Youtube ID: {video_id}"
    - "URL: {standard_short_url}"
  encoding: utf-8
  channel_display: formatted_version
  title_display: formatted_version
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
Output: ./transcripts/transcript_{id}_{formattedTitle}.md
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
  oldest: string|YYMMDDTHHMM
  newest: string|YYMMDDTHHMM
  per_entry:
    - videoId: string
    - channel: string|formatted
    - title: string|formatted
    - date_added: YYMMDDTHHMM
```

### TR-4: Clean Command (implements FR-6)

```yaml
Command: transcriptor clean {date}
Input: YYYY-MM-DD
Process:
  - convertToYYMMDD(input) → datePrefix
  - filterByDatePrefix(datePrefix, exclusive=true)
  - forEach(removeEntry)
Output: deleted_count
DateMatching:
  input_format: YYYY-MM-DD
  convert_to: YYMMDD
  match_against: first_6_chars_of_date_added
  ignore_time: true # THHMM portion
  example:
    input: "2025-11-22"
    converted: "251122"
    matches: "251121T1430" # older than boundary
    excludes: "251122T0900" # boundary date excluded
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

### TR-30: Date Conversion (implements FR-6.1)

```yaml
ConvertDateForCleaning:
  input: YYYY-MM-DD
  validate: /^\d{4}-\d{2}-\d{2}$/
  extract:
    year: substring(2,4) # YY
    month: substring(5,7) # MM
    day: substring(8,10) # DD
  output: YYMMDD
  usage: prefix_match_on_date_added
  example:
    input: "2025-11-22"
    output: "251122"
    matches: "251122T1430", "251121T2359"
    excludes: "251122T0000" # boundary excluded
```

### TR-31: Date Timestamp Generation (implements FR-3.2)

```yaml
GenerateDateAdded:
  trigger: new_transcript
  format: YYMMDDTHHMM
  components:
    - YY: current_year % 100
    - MM: current_month|zero_pad
    - DD: current_day|zero_pad
    - T: literal
    - HH: current_hour|zero_pad
    - MM: current_minute|zero_pad
  example: "251122T1430"
  precision: minute
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
  source: ~/.transcriptor/transcripts/transcript_{id}_{formattedTitle}.md
  target: ./transcripts/transcript_{id}_{formattedTitle}.md
  type: symbolic
  force: true
  filename: build_from_registry_metadata
  naming_consistency: same_pattern_both_locations
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

### TR-26: Title/Channel Sanitization (implements FR-2.5)

```yaml
SanitizeText:
  applies_to:
    - video_title
    - channel_name
  input: text_string
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
    - in: "TechLinked Channel"
      out: "techlinked_channel"
    - in: "How to Build REST APIs"
      out: "how_to_build_rest_apis"
    - in: "C++ Programming Tutorial #1"
      out: "c_programming_tutorial_1"
  storage:
    registry_channel: formatted_version
    registry_title: formatted_version
    file_header_channel: formatted_version
    file_header_title: formatted_version
```

### TR-27: Metadata Header Builder (implements FR-11)

```yaml
BuildMetadataHeader:
  input:
    channel: string|formatted
    title: string|formatted
    videoId: string
  template: |
    # Transcript

    ## Information

    Channel: {formatted_channel}
    Title: {formatted_title}
    Youtube ID: {videoId}
    URL: https://youtu.be/{videoId}

    ## Content

  validation:
    no_null_fields: true
    use_formatted_versions: true
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
    - channel|formatted
    - title|formatted
    - date_added|YYMMDDTHHMM
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
  schema:
    videoId:
      date_added: YYMMDDTHHMM
      channel: formatted_string
      title: formatted_string
```

### TR-17: Transcript Storage (implements FR-2.4, FR-11)

```yaml
SaveTranscript:
  path: ~/.transcriptor/transcripts/transcript_{id}_{formattedTitle}.md
  content: full_markdown_structure
  format: markdown
  encoding: utf-8
  structure:
    - "# Transcript"
    - ""
    - "## Information"
    - ""
    - "Channel: {formatted_channel}"
    - "Title: {formatted_title}"
    - "Youtube ID: {videoId}"
    - "URL: {buildShortUrl(videoId)}"
    - ""
    - "## Content"
    - ""
    - transcript_text
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
  format_after_extract:
    channel: sanitizeText(channel)
    title: sanitizeText(title)
  fallback:
    channel: "unknown_channel"
    title: "unknown_title"
  error_handling:
    - 400|404: use_fallback, log_warning
    - 500: use_fallback, log_warning
    - timeout: use_fallback, log_warning
```

### TR-21: Title/Channel Formatting Utility (implements FR-2.5)

```yaml
FormatText:
  applies_to: [title, channel]
  input: original_text
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
    "TechLinked" → "techlinked"
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
    - filename = "transcript_{videoId}_{formatted}.md"
  validation:
    - total_length < 255 # Filesystem limit
    - no_path_separators
  output: "transcript_{videoId}_{formattedTitle}.md"
  applies_to:
    - ~/.transcriptor/transcripts/
    - ./transcripts/ (symlinks)
```

### TR-24: Registry Update with Metadata (implements FR-3.2)

```yaml
UpdateRegistry:
  input:
    videoId: string
    metadata:
      channel: string|formatted
      title: string|formatted
  operation:
    - load_registry
    - update_or_create_entry:
        date_added: existing || generateDateAdded()
        channel: metadata.channel # formatted
        title: metadata.title # formatted
    - validate_schema
    - atomic_write
  schema_validation:
    - required_keys: [date_added, channel, title]
    - date_added: YYMMDDTHHMM
    - channel: non_empty_string|formatted
    - title: non_empty_string|formatted
  removed_fields:
    - links # no longer tracked
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
        - format_metadata(metadata) # sanitize title and channel
        - build_filename(videoId, metadata.title)
        - save_transcript_with_header(filename, header, transcript)
        - update_registry(videoId, metadata)
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

## Cleanup Operations

### TR-32: Cleanup Date Matching (implements FR-6.1)

```yaml
CleanupDateMatching:
  input: YYYY-MM-DD
  convert: YYMMDD
  match_logic:
    - extract_date_prefix: date_added.substring(0,6)
    - compare: prefix < converted_input
    - exclude_boundary: prefix != converted_input
  ignore: THHMM_portion
  example:
    input: "2025-11-22"
    converted: "251122"
    entry_1: "251121T1430" → DELETE (251121 < 251122)
    entry_2: "251122T0900" → KEEP (251122 == 251122)
    entry_3: "251123T1200" → KEEP (251123 > 251122)
```

### TR-33: File Deletion (implements FR-6.2)

```yaml
DeleteTranscript:
  input: videoId, metadata
  target: transcript_{videoId}_{formattedTitle}.md
  location: ~/.transcriptor/transcripts/
  operation:
    - build_filename(videoId, metadata.title)
    - delete_file(filename)
    - remove_registry_entry(videoId)
    - save_registry()
  no_link_deletion: links_not_tracked
```
