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
  note: "See TR-34 for unknown_title retry logic"
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
        - if(formatted_title == "unknown_title"): trigger_retry_loop (see TR-34)
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

### TR-34: Metadata Retry Logic (implements FR-2.6)

```yaml
RetryMetadataOnUnknownTitle:
  trigger: formatted_title == "unknown_title"
  retry_delay: 3000ms # 3 seconds
  max_retries: 3
  scope: metadata_only # Does not apply to transcript fetch
  process:
    - fetch_metadata → metadata
    - format_title(metadata.title) → formatted_title
    - attempt_counter = 0
    - while(formatted_title == "unknown_title" AND attempt_counter < 3):
        - log_retry_attempt(attempt_counter + 1, "API returned unknown_title")
        - sleep(3000ms)
        - attempt_counter++
        - fetch_metadata → metadata
        - format_title(metadata.title) → formatted_title
    - if(attempt_counter >= 3 AND formatted_title == "unknown_title"):
        - log_final_failure("Still unknown_title after 3 retries")
        - continue_with_unknown_title
  logging:
    retry_attempt: "API returned unknown_title, retrying in 3s (attempt X/3)"
    final_failure: "Still unknown_title after 3 retries, proceeding with this title"
  error_handling:
    metadata_fetch_error: treat_as_unknown, retry
    network_timeout: treat_as_unknown, retry
    max_retries_reached: accept_unknown_title, proceed
  behavior:
    - Does not affect transcript processing
    - Transcript fetched in parallel, metadata retry independent
    - Nonfatal: continues processing even after retries exhausted
```

## RAG Generator Integration

### TR-35: RAG Generator CLI Option (implements FR-12.1)

```yaml
RAGGeneratorOption:
  flag: --rag-generator
  type: boolean
  default: false
  scope: main_command
  parsing:
    library: commander
    method: .option('--rag-generator', 'Execute RAG generator after processing')
  behavior: optional|feature_disabled_by_default
  access: transcriptor --rag-generator
  compatibility: works_with_help, data, clean commands (ignored for non-process operations)
```

### TR-36: Command-Line Argument Parsing (implements FR-12.1, FR-8.5)

```yaml
CLIArgumentParsing:
  framework: commander
  entry: bin/transcriptor
  commands:
    main:
      name: transcriptor
      options:
        - name: --rag-generator
          description: "Execute RAG generator after processing youtube.md"
          type: boolean
          default: false
    help:
      name: help
      inheritance: no_flags
    data:
      name: data
      inheritance: no_flags
    clean:
      name: clean
      args: [date]
      inheritance: no_flags
  parsing_flow:
    - commander.parse(process.argv)
    - extract_flags_to_options_object
    - pass_to_command_handler
  flag_access:
    processor: cmd.ragGenerator || false
    availability: after_command_parse
```

### TR-37: RAG Generator Process Execution (implements FR-12.2)

```yaml
ExecuteRAGGenerator:
  timing: after_all_transcripts_processed_successfully
  trigger:
    - all_urls_from_youtube.md completed
    - no_fatal_processing_errors
    - --rag-generator_flag_true
  execution_context:
    cwd: ./transcripts # local project transcripts directory
    command: claude --dangerously-skip-permissions -p /rag-generator
  method: child_process.spawn
  spawn_options:
    stdio: inherit # output directly to console
    shell: true # allows shell syntax parsing
  error_isolation: nonfatal # RAG failure does not fail transcript processing
```

### TR-38: Process Spawn Implementation (implements FR-12.2)

```yaml
SpawnRAGProcess:
  module: child_process.spawn
  invocation: spawn(command, args, options)
  command_structure:
    executable: 'claude'
    arguments: ['--dangerously-skip-permissions', '-p', '/rag-generator']
    shell_context: true
  options_config:
    cwd: path.resolve('./transcripts')
    stdio: 'inherit'
    shell: true
    env: process.env # pass environment variables
  event_handling:
    close: event_handler(code, signal)
    error: event_handler(err)
    exit: event_handler(code, signal)
```

### TR-39: Working Directory Configuration (implements FR-12.2)

```yaml
WorkingDirectorySetup:
  requirement: execute_in_local_transcripts_folder
  path: path.resolve('./transcripts')
  validation:
    - check_exists: fs.existsSync(transcriptsDir)
    - action_missing: create_directory (ensureDir from fs-extra)
  spawn_option: cwd
  rationale: RAG generator processes files in current directory
```

### TR-40: RAG Generator Error Handling (implements FR-12.3)

```yaml
RAGGeneratorErrorHandling:
  severity: nonfatal
  condition: RAG_command_execution_failure
  behavior:
    - log_error: console.error with command details
    - continue_processing: do_not_exit_or_fail
  error_categories:
    command_not_found:
      trigger: ENOENT or command not found in PATH
      message: "Error: 'claude' command not found. Ensure claude-code is installed and accessible."
      action: log_and_continue
    permission_denied:
      trigger: EACCES
      message: "Error: Permission denied executing RAG generator command"
      action: log_and_continue
    spawn_error:
      trigger: spawn() throws
      message: "Error spawning RAG generator: {error_details}"
      action: log_and_continue
    process_exit_nonzero:
      trigger: code != 0
      message: "RAG generator exited with code: {code}"
      action: log_warning_and_continue
  logging:
    format: "[RAG-GENERATOR] {message}"
    level: error|warning
    include: error_message, exit_code, signal
  failure_recovery: none # No retry
```

### TR-41: Integration Point in Processing Workflow (implements FR-12.1, FR-12.2)

```yaml
RAGIntegrationPoint:
  location: src/commands/process.js
  phase: after_processBatch_completes
  decision_gate:
    condition_1: result.errors.length == 0 || some_transcripts_succeeded
    condition_2: options.ragGenerator == true
  flow:
    1_process_all_urls: transcriptService.processBatch(urls)
    2_collect_results: get result object with stats
    3_check_rag_flag: if(options.ragGenerator && has_any_success)
    4_ensure_dir: ensureDir('./transcripts')
    5_spawn_process: executeRAGGenerator()
    6_handle_result: catch errors, log, continue
    7_summary_output: display final summary
  success_conditions:
    - transcripts_processed: result.successful > 0
    - rag_execution: exit_code_received
  failure_modes:
    - rag_not_installed: log_error, continue
    - rag_fails: exit_code != 0, log_error, continue
    - missing_transcripts_dir: create_directory, continue
```

### TR-42: Process State Management (implements FR-12.2)

```yaml
ProcessStateTracking:
  result_object:
    structure:
      successful: number # URLs processed successfully
      failed: number # URLs that failed
      cached: number # URLs retrieved from cache
      errors: [error_objects]
      ragGenerator:
        executed: boolean # was RAG generator attempted
        exitCode: number|null
        error: string|null
  rag_execution_tracking:
    spawn_callback:
      - close_event: code, signal
      - error_event: error_object
    return_promise:
      - resolve: once_process_closes
      - reject: never (error_caught)
  console_output:
    pre_rag: summary_of_transcript_results
    rag_start: "Executing RAG generator in ./transcripts..."
    rag_success: "RAG generator completed with code {code}"
    rag_error: "RAG generator failed: {error}"
```

### TR-43: CLI Command Definition Update (implements FR-8.5)

```yaml
UpdateCommandDefinition:
  file: bin/transcriptor
  section: main_command_definition
  changes:
    - add_option: .option('--rag-generator', 'Enable RAG generator after processing')
    - update_handler: export_action_with_options_object
    - pass_ragGenerator: propagate_to_process_command
  signature:
    before: transcriptor [options] [args]
    after: transcriptor [--rag-generator] [options] [args]
  usage_examples:
    basic: "transcriptor --rag-generator"
    with_help: "transcriptor --help"
    data_unaffected: "transcriptor data"
    clean_unaffected: "transcriptor clean 2025-11-22"
```

### TR-44: Environment and Logging (implements FR-12.3)

```yaml
EnvironmentLogging:
  log_location: console (stdio inherit during RAG execution)
  log_format:
    transcript_phase: "[TRANSCRIPTOR] {message}"
    rag_phase: "[RAG-GENERATOR] {message}"
  environment_pass_through:
    variables: all (process.env)
    claude_permissions: --dangerously-skip-permissions (handles permission checks)
  output_handling:
    inherit_mode: child process outputs directly to stdout/stderr
    capture_mode: not_used (outputs to terminal)
  exit_behavior:
    transcript_error: process_continues_for_other_urls
    rag_error: process_exits_with_summary (RAG failure does_not_exit)
```

## RAG Generator Gemini Integration

### TR-45: RAG Generator Gemini CLI Option (implements FR-13.1)

```yaml
RAGGeneratorGeminiOption:
  flag: --rag-generator-gemini
  type: boolean
  default: false
  scope: main_command
  parsing:
    library: commander
    method: .option('--rag-generator-gemini', 'Execute RAG generator Gemini after processing')
  behavior: optional|feature_disabled_by_default
  access: transcriptor --rag-generator-gemini
  compatibility: works_with_help, data, clean commands (ignored for non-process operations)
  mutual_exclusivity: cannot_be_used_with_rag_generator
```

### TR-46: Command-Line Argument Parsing (implements FR-13.1, FR-8.6)

```yaml
CLIArgumentParsing:
  framework: commander
  entry: bin/transcriptor
  commands:
    main:
      name: transcriptor
      options:
        - name: --rag-generator
          description: "Execute RAG generator after processing youtube.md"
          type: boolean
          default: false
        - name: --rag-generator-gemini
          description: "Execute RAG generator Gemini after processing youtube.md"
          type: boolean
          default: false
      validation:
        - mutually_exclusive: [--rag-generator, --rag-generator-gemini]
        - error_message: "Cannot use both --rag-generator and --rag-generator-gemini simultaneously"
  parsing_flow:
    - commander.parse(process.argv)
    - validate_mutual_exclusivity
    - extract_flags_to_options_object
    - pass_to_command_handler
  flag_access:
    processor: cmd.ragGenerator || cmd.ragGeneratorGemini
    availability: after_command_parse
```

### TR-47: RAG Generator Gemini Process Execution (implements FR-13.2)

```yaml
ExecuteRAGGeneratorGemini:
  timing: after_all_transcripts_processed_successfully
  trigger:
    - all_urls_from_youtube.md completed
    - no_fatal_processing_errors
    - --rag-generator-gemini_flag_true
  execution_context:
    cwd: ./transcripts # local project transcripts directory
    command: gemini-rag-generator # standalone command
  method: child_process.spawn
  spawn_options:
    stdio: inherit # output directly to console
    shell: true # allows shell syntax parsing
  error_isolation: nonfatal # RAG failure does not fail transcript processing
```

### TR-48: RAG Executor Command Type Support (implements FR-13.2)

```yaml
RAGExecutorCommandTypes:
  supported_commands:
    - type: default
      command_type: claude
      command: claude --dangerously-skip-permissions -p /rag-generator
      description: Standard RAG processing using Claude CLI
    - type: gemini
      command_type: standalone
      command: gemini-rag-generator
      description: Gemini-based RAG processing using standalone command
  implementation:
    method: RAGExecutor.execute(projectDir, commandType)
    parameter: commandType = 'default' | 'gemini'
    command_mapping:
      default:
        type: claude
        command: claude --dangerously-skip-permissions -p /rag-generator
      gemini:
        type: standalone
        command: gemini-rag-generator
```

### TR-49: Mutual Exclusivity Validation (implements FR-13.3)

```yaml
MutualExclusivityValidation:
  location: src/commands/process.js
  validation_point: before_rag_execution
  condition: ragGenerator && ragGeneratorGemini
  error_handling:
    message: "Error: Cannot use both --rag-generator and --rag-generator-gemini simultaneously"
    action: throw_error
    exit_code: 1
  bypass: if_only_one_flag_true
```
