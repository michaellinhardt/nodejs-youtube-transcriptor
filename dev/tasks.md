# Tasks

<!-- Task List Generated: 2025-11-19 -->
<!-- Next Review Recommended: 2025-11-26 -->

## Development Sequence Notes

Priority order: 1.0 → 2.0 → 3.0 → 4.0 → 5.0 → 6.0 (can parallel with 7.0) → 8.0 → 9.0 → 10.0
Critical path: 1.0 → 2.1 → 3.1 → 4.1 → 5.1 → 10.1 → 10.2
High-risk items: 4.3 (API integration), 5.3 (symbolic links cross-platform), 10.1 (oEmbed API integration)

## 1.0 Project Initialization & Setup

<!-- Estimated: 4 hours total -->

- [x] 1.1 Initialize npm package structure
  - [x] 1.1.1 Create package.json with global CLI configuration
  - [x] 1.1.2 Verify src/index.js entry point (existing file with shebang)
  - [x] 1.1.3 Configure package for npm link usage
- [x] 1.2 Install and configure dependencies
  - [x] 1.2.1 Install commander@^12.0.0 for CLI framework
  - [x] 1.2.2 Install axios@^1.7.0 for HTTP client
  - [x] 1.2.3 Install fs-extra@^11.0.0 for file operations
  - [x] 1.2.4 Install dotenv@^16.0.0 for environment variables
- [x] 1.3 Set up project structure (implements TR-1, Module Structure)
  - [x] 1.3.1 Create src/index.js for command router
  - [x] 1.3.2 Create src/commands/ directory for command handlers
  - [x] 1.3.3 Create src/services/ directory for business logic
  - [x] 1.3.4 Create src/utils/ directory for shared utilities
- [x] 1.4 Configure environment setup
  - [x] 1.4.1 Create .env.example file
  - [x] 1.4.2 Bug fixes and resilience improvements
  - [x] 1.4.3 Create .gitignore with proper exclusions
  - [x] 1.4.4 Set up ESLint and Prettier configuration

## 2.0 Core Infrastructure Development

<!-- Estimated: 12 hours total | Blocks: 3.0, 4.0, 5.0 -->

- [x] 2.1 Path management system [CRITICAL PATH] (implements TR-10)
  - [x] 2.1.1 Create PathResolver utility for cross-platform paths
  - [x] 2.1.2 Implement home directory resolution
  - [x] 2.1.3 Define storage paths (~/.transcriptor structure)
  - [x] 2.1.4 Implement local project path resolution
- [x] 2.2 Environment configuration (implements TR-11)
  - [x] 2.2.1 Create environment loader with dotenv
  - [x] 2.2.2 Implement API key validation
  - [x] 2.2.3 Add error handling for missing configuration
- [x] 2.3 CLI framework setup (implements TR-18)
  - [x] 2.3.1 Set up commander.js in bin/transcriptor
  - [x] 2.3.2 Define command routing structure
  - [x] 2.3.3 Implement help text generation
  - [x] 2.3.4 Add version information display

## 3.0 Storage System Implementation

<!-- Estimated: 16 hours total | Depends on: 2.1 -->

- [x] 3.1 Storage service core [CRITICAL PATH] (implements FR-3)
  - [x] 3.1.1 Create StorageService class structure
  - [x] 3.1.2 Implement initialization operations (TR-19)
  - [x] 3.1.3 Ensure ~/.transcriptor directory structure
  - [x] 3.1.4 Initialize empty data.json if missing
- [x] 3.2 Registry operations (implements FR-3.2, TR-16) [REMEDIATED 2025-11-19] [REFACTORED 2025-11-19]
  - [x] 3.2.1 Implement registry loading from data.json
  - [x] 3.2.2 Create registry update methods (saveRegistry)
  - [x] 3.2.3 Implement atomic write operations (TR-8)
  - [x] 3.2.4 Add registry validation logic (isValidRegistryStructure)
  - [x] 3.2.5 Fix double-initialization vulnerability
  - [x] 3.2.6 Add null checks in error recovery paths
  - [x] 3.2.7 Fix validation error propagation
  - [x] 3.2.8 Handle race conditions in atomic write
  - [x] 3.2.9 Add error handling in validation function
  - [x] 3.2.10 Extract validation helpers from isValidRegistryStructure
  - [x] 3.2.11 Apply guard clauses to loadRegistry and saveRegistry
  - [x] 3.2.12 Introduce named constants for allowed keys and format specifications
  - [x] 3.2.13 Refactor atomic write error handling into separate methods
  - [x] 3.2.14 Improve error messages with contextual information
  - [x] 3.2.15 Rename variables for clarity (exists to fileExists, data to registryData)
- [x] 3.3 File operations (implements TR-17)
  - [x] 3.3.1 Implement transcript save functionality
  - [x] 3.3.2 Create transcript read methods
  - [x] 3.3.3 Add file existence checking
  - [x] 3.3.4 Implement file deletion with error handling

## 4.0 API Integration Layer

<!-- Estimated: 12 hours total | Depends on: 2.2 | High Risk -->

- [x] 4.1 API client setup [CRITICAL PATH] (implements FR-2.1) [BUG FIXES APPLIED 2025-11-19] [REFACTORED 2025-11-19]
  - [x] 4.1.1 Create APIClient service class
  - [x] 4.1.2 Configure axios with base settings
  - [x] 4.1.3 Add API key header injection
  - [x] 4.1.4 Set timeout configuration (30s)
  - [x] 4.1.5 Fix null/undefined error response handling
  - [x] 4.1.6 Add interceptor response config null safety
  - [x] 4.1.7 Fix initialization state race condition
  - [x] 4.1.8 Add empty string after trim validation
  - [x] 4.1.9 Add error code null/undefined checks
  - [x] 4.1.10 Fix sanitize context non-string data
  - [x] 4.1.11 Add validateVideoUrl edge cases
  - [x] 4.1.12 Fix request interceptor error handler
  - [x] 4.1.13 Add handleNetworkError null safety
  - [x] 4.1.14 Remove fetchTranscript try-catch redundancy
  - [x] 4.1.15 Add response validation null safety
  - [x] 4.1.16 Fix getSanitizedConfig shallow copy issue
  - [x] 4.1.17 Fix transformError default case type safety
  - [x] 4.1.18 Add initialization cleanup on failure
  - [x] 4.1.19 Extract configuration constants to APIClientConstants.js
  - [x] 4.1.20 Create ValidationHelpers utility module
  - [x] 4.1.21 Create ErrorHandler utility module
  - [x] 4.1.22 Create URLValidator utility module
  - [x] 4.1.23 Decompose fetchWithRetry into focused methods
  - [x] 4.1.24 Decompose transformError into focused methods
  - [x] 4.1.25 Apply guard clauses to reduce nesting depth
  - [x] 4.1.26 Rename unclear variables (ms to delayMilliseconds, parsed to retryAfterSeconds)
  - [x] 4.1.27 Extract interceptor logic to named methods
  - [x] 4.1.28 Refactor URLParser to use extracted utilities
  - [x] 4.1.29 Reduce APIClient from 722 to 770 lines (includes better structure with extracted modules)
  - [x] 4.1.30 Reduce method complexity and improve readability
- [x] 4.2 Scrape Creators API integration
  - [x] 4.2.1 Implement fetchTranscript method
  - [x] 4.2.2 Parse transcript_only_text from response
  - [x] 4.2.3 Add request/response logging
  - [x] 4.2.4 Fix null response validation in executeApiRequest
  - [x] 4.2.5 Enhance field existence check in extractTranscriptText
  - [x] 4.2.6 Add 10MB transcript size validation
  - [x] 4.2.7 Add per-request duration and size logging
- [x] 4.3 Error handling and retries [HIGH RISK] (implements TR-12)
  - [x] 4.3.1 Implement exponential backoff for 429 errors
  - [x] 4.3.2 Handle API authentication errors (401)
  - [x] 4.3.3 Add timeout error handling
  - [x] 4.3.4 Implement skip logic for 400/500 errors

## 5.0 Transcript Processing Engine

<!-- Estimated: 20 hours total | Depends on: 3.1, 4.1 -->

- [x] 5.1 URL parsing and validation [CRITICAL PATH] (implements FR-1.1, TR-5)
  - [x] 5.1.1 Create URL parser for youtube.md files
  - [x] 5.1.2 Implement YouTube ID extraction regex
  - [x] 5.1.3 Add video ID validation (11 chars, alphanumeric+dash)
  - [x] 5.1.4 Handle invalid URL formats gracefully
- [x] 5.2 Cache management (implements FR-2.2, TR-6)
  - [x] 5.2.1 Implement cache checking logic
  - [x] 5.2.2 Create cache-first retrieval strategy
  - [x] 5.2.3 Add cache hit/miss logging
- [x] 5.3 Symbolic link management (implements FR-4, TR-9) [REMEDIATED 2025-11-19] [REFACTORED 2025-11-19]
  - [x] 5.3.1 Implement symbolic link creation
  - [x] 5.3.2 Add link tracking in registry
  - [x] 5.3.3 Handle existing link overwrites
  - [x] 5.3.4 Add cross-platform link compatibility
  - [x] 5.3.5 Complete TranscriptService integration with processBatch
  - [x] 5.3.6 Refactor processVideo to implement explicit TR-7 workflow steps
  - [x] 5.3.7 Validate registry schema compliance in \_trackLink
  - [x] 5.3.8 Verify cross-platform compatibility with enhanced error messages
  - [x] 5.3.9 Add extractVideoId implementing TR-5 URL parsing
  - [x] 5.3.10 Extract console output formatting to ConsoleFormatter utility
  - [x] 5.3.11 Create ResultFactory for standardized result objects
  - [x] 5.3.12 Extract log message templates to LogMessages constants
  - [x] 5.3.13 Extract YouTube constants to YouTubeConstants module
  - [x] 5.3.14 Improve variable naming (isCachedAndValid, transcriptFileExists, errorEntry, errorIndex)
  - [x] 5.3.15 Extract \_getOrFetchTranscript private method with guard clause
  - [x] 5.3.16 Extract \_processSingleUrl private method
  - [x] 5.3.17 Extract \_aggregateBatchResult private method
  - [x] 5.3.18 Extract \_displayBatchSummary private method
  - [x] 5.3.19 Refactor processBatch to use extracted helper methods
  - [x] 5.3.20 Update all console log statements to use LOG_MESSAGES templates
- [x] 5.4 Processing workflow (implements FR-2.3, TR-7)
  - [x] 5.4.1 Create TranscriptService orchestrator
  - [x] 5.4.2 Implement sequential processing loop
  - [x] 5.4.3 Add immediate persistence after fetch
  - [x] 5.4.4 Implement registry updates per transcript

## 6.0 Command Implementations

<!-- Estimated: 16 hours total | Depends on: 5.0 | Can parallel with 7.0 -->

- [x] 6.1 Main command handler (implements FR-8.1, TR-1) [BUG FIXES APPLIED 2025-11-19]
  - [x] 6.1.1 Create process command implementation
  - [x] 6.1.2 Add youtube.md file validation
  - [x] 6.1.3 Implement URL processing pipeline
  - [x] 6.1.4 Add progress output and status reporting
  - [x] 6.1.5 Fix duplicate cache statistics tracking
  - [x] 6.1.6 Add error handling for cache read failures
  - [x] 6.1.7 Add missing video ID validation in LinkManager.\_trackLink
  - [x] 6.1.8 Remove unnecessary path traversal check
  - [x] 6.1.9 Add null safety guards in ConsoleFormatter
- [x] 6.2 Help command (implements FR-8.2, TR-2)
  - [x] 6.2.1 Create comprehensive help text
  - [x] 6.2.2 Add command examples
  - [x] 6.2.3 Display when youtube.md missing
- [x] 6.3 Data statistics command (implements FR-5.1, TR-3, TR-15)
  - [x] 6.3.1 Implement transcript count calculation
  - [x] 6.3.2 Add folder size calculation
  - [x] 6.3.3 Calculate date range (oldest/newest)
  - [x] 6.3.4 Format output in human-readable form
- [x] 6.4 Clean command (implements FR-6, TR-4)
  - [x] 6.4.1 Parse and validate date input
  - [x] 6.4.2 Filter transcripts by date (exclusive)
  - [x] 6.4.3 Delete transcript files and links
  - [x] 6.4.4 Update registry after cleanup

## 7.0 Maintenance Features

<!-- Estimated: 12 hours total | Depends on: 3.0 | Can parallel with 6.0 -->

- [x] 7.1 Auto-maintenance system (implements FR-7, TR-14)
  - [x] 7.1.1 Create integrity validation routine
  - [x] 7.1.2 Check registry entries against files
  - [x] 7.1.3 Remove orphaned registry entries
  - [x] 7.1.4 Clean up broken symbolic links
- [x] 7.2 Link cleanup operations (implements FR-6.2)
  - [x] 7.2.1 Implement link deletion across all tracked paths (LinkManager.removeAllLinks)
  - [x] 7.2.2 Handle missing link errors gracefully (ENOENT idempotent)
  - [x] 7.2.3 Remove paths from registry after deletion
- [x] 7.3 Data integrity operations (implements FR-9)
  - [x] 7.3.1 Validate data.json structure on load (isValidRegistryStructure)
  - [x] 7.3.2 Add recovery for corrupted registry (loadRegistry validation)
  - [x] 7.3.3 Implement backup before destructive operations (atomic writes per TR-8)

## 8.0 Error Handling & Recovery

<!-- Estimated: 8 hours total | Depends on: 6.0 -->

- [x] 8.1 File system error handling (implements TR-13)
  - [x] 8.1.1 Handle ENOENT (create missing directories) (StorageService, LinkManager)
  - [x] 8.1.2 Handle EACCES (permission errors) (all services)
  - [x] 8.1.3 Handle EEXIST (overwrite scenarios) (atomic write, ensureDir)
  - [x] 8.1.4 Handle EINVAL (invalid paths)
- [x] 8.2 Process error recovery (implements FR-10)
  - [x] 8.2.1 Continue processing after individual failures (clean.js, process.js)
  - [x] 8.2.2 Skip failed URLs and log errors (TranscriptService.processBatch)
  - [x] 8.2.3 Preserve successful operations on crash (atomic writes per TR-8)
  - [x] 8.2.4 Allow re-run to complete unfinished work (cache-first strategy)
- [x] 8.3 Input validation
  - [x] 8.3.1 Validate command arguments (clean validates date, process validates file)
  - [x] 8.3.2 Sanitize video IDs (validators.sanitizeVideoId, regex validation)
  - [x] 8.3.3 Validate date formats (validators.isValidDate, assertValidDate)
  - [x] 8.3.4 Check path traversal attempts (validators.sanitizeVideoId prevents, path.isAbsolute checks)

## 9.0 Documentation & Deployment

<!-- Estimated: 8 hours total | Depends on: 8.0 -->

- [x] 9.1 User documentation
  - [x] 9.1.1 Create comprehensive README.md
  - [x] 9.1.2 Document installation process
  - [x] 9.1.3 Add usage examples
  - [x] 9.1.4 Document all commands and options
- [x] 9.2 Developer documentation
  - [x] 9.2.1 Document API integration details
  - [x] 9.2.2 Add architecture diagrams
  - [x] 9.2.3 Document data flow
  - [x] 9.2.4 Create contribution guidelines
- [x] 9.3 Deployment preparation & Performance
  - [x] 9.3.1 Create installation script
  - [x] 9.3.2 Add uninstall cleanup procedures
  - [x] 9.3.3 Optimize registry loading for large datasets
  - [x] 9.3.4 Implement progress indicators
  - [x] 9.3.5 Add verbose/quiet mode options
  - [x] 9.3.6 Profile and optimize bottlenecks

## 10.0 Metadata Collection Feature

<!-- Estimated: 16 hours total | Depends on: 4.1, 5.4 | Critical for FR-2.2, FR-2.5, FR-3.3, FR-11 -->

- [x] 10.1 MetadataService implementation [CRITICAL PATH] (implements FR-2.2, TR-20)
  - [x] 10.1.1 Create MetadataService class in src/services/MetadataService.js
  - [x] 10.1.2 Implement fetchVideoMetadata method using YouTube oEmbed API
  - [x] 10.1.3 Configure axios GET request to https://www.youtube.com/oembed endpoint
  - [x] 10.1.4 Add 15s timeout for metadata API calls (TR-20)
  - [x] 10.1.5 Extract author_name as channel from oEmbed response
  - [x] 10.1.6 Extract title from oEmbed response
  - [x] 10.1.7 Implement fallback values (Unknown Channel, Unknown Title) for failures
  - [x] 10.1.8 Add error handling for 400, 404, 500, timeout (implements TR-29)
  - [x] 10.1.9 Ensure metadata fetch failures are non-fatal (log warning, continue processing)
  - [x] 10.1.10 Add unit validation for metadata response structure
- [x] 10.2 Title formatting utility (implements FR-2.5, TR-21, TR-26)
  - [x] 10.2.1 Create formatTitle method in MetadataService or utils/TitleFormatter.js
  - [x] 10.2.2 Implement trim and lowercase transformation
  - [x] 10.2.3 Replace spaces with underscores (regex /\s+/g)
  - [x] 10.2.4 Remove invalid characters (allow only a-z0-9_-)
  - [x] 10.2.5 Collapse consecutive underscores to single underscore
  - [x] 10.2.6 Remove leading/trailing underscores
  - [x] 10.2.7 Truncate to 100 characters for filesystem safety
  - [x] 10.2.8 Handle edge cases: empty string, null input (fallback to "untitled")
  - [x] 10.2.9 Validate output pattern matches /^[a-z0-9][a-z0-9_-]*$/
- [x] 10.3 Short URL builder utility (implements FR-3.3, TR-22, TR-28)
  - [x] 10.3.1 Create buildShortUrl method in MetadataService or utils/URLBuilder.js
  - [x] 10.3.2 Implement template: https://youtu.be/{videoId}
  - [x] 10.3.3 Add videoId validation (11 chars, alphanumeric+dash)
  - [x] 10.3.4 Return standardized short URL format
- [x] 10.4 File naming updates (implements FR-2.4, TR-23)
  - [x] 10.4.1 Update StorageService.saveTranscript to accept metadata parameter
  - [x] 10.4.2 Build filename using {videoId}_{formattedTitle}.md pattern
  - [x] 10.4.3 Update StorageService.getTranscriptPath to use metadata-based naming
  - [x] 10.4.4 Ensure filename total length < 255 chars (filesystem limit)
  - [x] 10.4.5 Update StorageService.transcriptExists to search by metadata-based filename
  - [x] 10.4.6 Update all file operation methods to use new naming convention
- [x] 10.5 Registry schema updates (implements FR-3.2, TR-24)
  - [x] 10.5.1 Update StorageService.ALLOWED_ENTRY_KEYS to include channel and title
  - [x] 10.5.2 Update isValidRegistryStructure to validate channel field (non-empty string)
  - [x] 10.5.3 Update isValidRegistryStructure to validate title field (non-empty string)
  - [x] 10.5.4 Update registry update operations to save metadata (channel, title)
  - [x] 10.5.5 Ensure backward compatibility for existing registry entries
  - [x] 10.5.6 Add migration logic to handle old registry format (if needed)
- [x] 10.6 Metadata header builder (implements FR-11, TR-27)
  - [x] 10.6.1 Create buildMetadataHeader method in StorageService or utils/HeaderBuilder.js
  - [x] 10.6.2 Implement template: Channel, Title, Youtube ID, URL (4 lines)
  - [x] 10.6.3 Use buildShortUrl for URL field
  - [x] 10.6.4 Preserve original video title (no formatting in header)
  - [x] 10.6.5 Validate no null fields before building header
  - [x] 10.6.6 Return multiline string with proper formatting
- [x] 10.7 Transcript processing workflow updates (implements FR-2, TR-25)
  - [x] 10.7.1 Update TranscriptService constructor to accept MetadataService dependency
  - [x] 10.7.2 Implement parallel fetch: Promise.all([fetchTranscript(), fetchMetadata()])
  - [x] 10.7.3 Update processVideo to call fetchMetadata alongside fetchTranscript
  - [x] 10.7.4 Pass metadata to StorageService.saveTranscript for header and filename
  - [x] 10.7.5 Update registry update calls to include metadata (channel, title)
  - [x] 10.7.6 Ensure metadata fetch failure does not block transcript processing
  - [x] 10.7.7 Update cache checking logic to handle metadata-based filenames
  - [x] 10.7.8 Update link creation to use metadata-based filenames
- [x] 10.8 Error handling for metadata operations (implements TR-29)
  - [x] 10.8.1 Add try-catch around fetchMetadata calls in TranscriptService
  - [x] 10.8.2 Log warnings for metadata fetch failures (do not throw)
  - [x] 10.8.3 Use fallback values when metadata unavailable
  - [x] 10.8.4 Ensure transcript processing continues regardless of metadata failures
  - [x] 10.8.5 Add metadata error statistics to TranscriptService.stats
- [x] 10.9 Command updates for metadata feature
  - [x] 10.9.1 Update src/commands/process.js to instantiate MetadataService
  - [x] 10.9.2 Pass MetadataService to TranscriptService constructor
  - [x] 10.9.3 Update src/commands/data.js to display channel and title in statistics
  - [x] 10.9.4 Update StatisticsCalculator to include metadata fields
  - [x] 10.9.5 Verify clean command handles metadata-based filenames correctly
- [ ] 10.10 Integration testing and verification
  - [ ] 10.10.1 Test fetchMetadata with valid video ID
  - [ ] 10.10.2 Test fetchMetadata with invalid/deleted video (404 fallback)
  - [ ] 10.10.3 Test title sanitization with special characters, spaces, unicode
  - [ ] 10.10.4 Verify metadata headers appear in transcript files
  - [ ] 10.10.5 Verify filenames use formatted titles {videoId}_{formattedTitle}.md
  - [ ] 10.10.6 Verify registry contains channel and title fields
  - [ ] 10.10.7 Test backward compatibility with existing transcripts (no metadata)
  - [ ] 10.10.8 Verify data command displays metadata correctly
  - [ ] 10.10.9 Verify clean command deletes metadata-based files
  - [ ] 10.10.10 Test parallel fetch performance (transcript + metadata)
