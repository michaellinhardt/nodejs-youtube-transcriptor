# System Architecture

## System Overview

Transcriptor is a command-line tool built on a modular architecture that separates concerns across distinct layers. The system follows a service-oriented design where business logic is isolated in dedicated services, utilities provide reusable functionality, and command handlers orchestrate user interactions.

The architecture centers on three key design decisions:

1. **Centralized Storage**: A single user-wide storage location (`~/.transcriptor`) serves as the source of truth for all transcript data
2. **Symbolic Link Distribution**: Transcripts are shared across projects through symbolic links rather than file duplication
3. **Cache-First Strategy**: All operations check local storage before making external API calls

### Technology Stack

- **Runtime**: Node.js v18+
- **CLI Framework**: commander.js (command parsing and routing)
- **HTTP Client**: axios (API communication)
- **File Operations**: fs-extra (filesystem utilities)
- **Environment Management**: dotenv (configuration)

### Architectural Layers

```
┌─────────────────────────────────────────────────┐
│          CLI Layer (commander.js)                │
│  Entry Point: bin/transcriptor → src/index.js   │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│            Command Handlers Layer                │
│     process | help | data | clean               │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│              Services Layer                      │
│  TranscriptService | StorageService              │
│  APIClient | LinkManager | MaintenanceService   │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│              Utilities Layer                     │
│  PathResolver | Validators | URLParser           │
│  ConsoleFormatter | StatisticsCalculator        │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│          External Dependencies                   │
│  Scrape Creators API | Filesystem | OS Env      │
└─────────────────────────────────────────────────┘
```

## Component Architecture

```mermaid
graph TD
    A[CLI Framework<br/>commander.js] --> B[Command Handlers]
    B --> B1[Process Command<br/>process.js]
    B --> B2[Help Command<br/>help.js]
    B --> B3[Data Command<br/>data.js]
    B --> B4[Clean Command<br/>clean.js]

    B1 --> C[TranscriptService]
    B1 --> C2[StorageService]
    B1 --> M[MaintenanceService]
    B3 --> C2
    B3 --> S[StatisticsCalculator]
    B4 --> C2
    B4 --> M

    C --> D[APIClient]
    C --> C2
    C --> F[LinkManager]

    D --> G[Scrape Creators API<br/>External]
    C2 --> H[Filesystem<br/>~/.transcriptor]
    F --> H

    C --> I[URLParser]
    C --> J[Validators]
    C2 --> K[PathResolver]
    F --> K

    D --> E1[ErrorHandler]
    D --> E2[URLValidator]
    D --> E3[ValidationHelpers]

    C --> CF[ConsoleFormatter]
    C --> RF[ResultFactory]
    C --> LM[LogMessages]

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style C2 fill:#e8f5e9
    style D fill:#e8f5e9
    style F fill:#e8f5e9
    style M fill:#e8f5e9
    style G fill:#ffebee
    style H fill:#ffebee
```

### Component Descriptions

#### CLI Framework (bin/transcriptor, src/index.js)

**Responsibility**: Parse command-line arguments and route to appropriate command handlers

**Key Functions**:
- Parse argv with commander.js
- Define available commands (default, help, data, clean)
- Route commands to handlers
- Display version information

**Dependencies**: commander.js library

**Interfaces**:
```javascript
// Entry point
#!/usr/bin/env node
program
  .name('transcriptor')
  .description('YouTube transcript extractor and manager')
  .version('1.0.0');

program
  .command('help')
  .action(() => require('./commands/help')());

program
  .command('data')
  .action(() => require('./commands/data')());

program
  .command('clean <date>')
  .action((date) => require('./commands/clean')(date));

program.action(() => require('./commands/process')());
```

#### Command Handlers (src/commands/)

**Process Command** (`src/commands/process.js`):
- Validates youtube.md file exists
- Reads and parses YouTube URLs
- Runs auto-maintenance to validate integrity
- Delegates to TranscriptService for processing
- Displays summary statistics

**Help Command** (`src/commands/help.js`):
- Displays usage information
- Shows command examples
- Triggered when youtube.md missing

**Data Command** (`src/commands/data.js`):
- Loads registry from storage
- Calculates statistics (count, size, date range)
- Formats output in human-readable form

**Clean Command** (`src/commands/clean.js`):
- Validates date format (YYYY-MM-DD)
- Filters registry for entries older than date
- Deletes transcript files, links, and registry entries
- Displays deletion count

#### TranscriptService (src/services/TranscriptService.js)

**Responsibility**: Orchestrate transcript acquisition with cache-first strategy

**Key Functions**:
- Check cache before API calls (FR-2.2, TR-6)
- Fetch transcripts via APIClient when cache miss
- Save transcripts immediately (FR-2.3, crash resilience)
- Create symbolic links via LinkManager
- Track statistics (cache hits, misses, links created)
- Process URLs sequentially (one at a time)

**Dependencies**: StorageService, APIClient, LinkManager, PathResolver

**Key Methods**:
```javascript
class TranscriptService {
  async processBatch(urls) // Process multiple URLs sequentially
  async processVideo(videoId, url) // Process single video (TR-7 workflow)
  async _checkCache(videoId) // Verify cache hit/miss
  async _getOrFetchTranscript(videoId, url) // Get cached or fetch new
  extractVideoId(url) // Parse YouTube ID from URL (TR-5)
}
```

**Processing Workflow** (TR-7):
1. Extract video ID from URL
2. Check cache (registry + file existence)
3. If cache hit: load transcript from storage
4. If cache miss: fetch from API
5. Save transcript to storage
6. Create symbolic link
7. Update registry
8. Persist registry atomically

#### StorageService (src/services/StorageService.js)

**Responsibility**: Manage filesystem persistence and registry operations

**Key Functions**:
- Initialize storage structure (~/.transcriptor, transcripts/)
- Load and save registry with atomic writes (TR-8, FR-9.1)
- Validate registry structure (FR-9.2)
- Save and load transcript files
- Delete transcripts and registry entries
- Ensure directories exist

**Dependencies**: fs-extra, PathResolver, Validators

**Key Methods**:
```javascript
class StorageService {
  async initialize() // Create directory structure (TR-19)
  async loadRegistry() // Load data.json with validation
  async saveRegistry(registry) // Atomic write to data.json
  async saveTranscript(videoId, content) // Write transcript file
  async loadTranscript(videoId) // Read transcript file
  async deleteTranscript(videoId) // Remove transcript file
  async transcriptExists(videoId) // Check file existence
  isValidRegistryStructure(data) // Validate schema
}
```

**Registry Schema**:
```javascript
{
  "videoId1": {
    "date_added": "2025-11-19",
    "links": [
      "/absolute/path/to/project1/transcripts/videoId1.md",
      "/absolute/path/to/project2/transcripts/videoId1.md"
    ]
  },
  "videoId2": {
    "date_added": "2025-11-18",
    "links": [
      "/absolute/path/to/project1/transcripts/videoId2.md"
    ]
  }
}
```

#### APIClient (src/services/APIClient.js)

**Responsibility**: HTTP communication with Scrape Creators API

**Key Functions**:
- Configure axios instance with authentication
- Inject API key via request interceptor
- Fetch transcripts from external API (FR-2.1)
- Implement exponential backoff retry for 429 errors (TR-12)
- Transform HTTP errors to application error types
- Validate response structure and size
- Log requests/responses (sanitized, no API key exposure)

**Dependencies**: axios, ErrorHandler, ValidationHelpers, URLValidator

**Key Methods**:
```javascript
class APIClient {
  async initialize() // Setup axios instance with interceptors
  async fetchTranscript(videoUrl) // Main public method
  async _fetchWithRetry(videoUrl, attempt) // Retry logic
  _transformError(error) // Classify error types
  _validateResponse(response) // Check transcript_only_text field
  _sanitizeConfig(config) // Remove API key from logs
}
```

**Error Handling** (TR-12):
- 400 Bad Request → Skip URL, continue
- 401 Unauthorized → Exit process with API key error
- 429 Rate Limited → Exponential backoff (1s, 2s, 4s), max 3 attempts
- 500 Server Error → Skip URL, continue
- Timeout → Skip URL, continue

#### LinkManager (src/services/LinkManager.js)

**Responsibility**: Create and manage symbolic links between central storage and project directories

**Key Functions**:
- Create symbolic links (FR-4.1, TR-9)
- Track link locations in registry (FR-4.2)
- Remove links during cleanup
- Handle cross-platform path resolution
- Ensure project-local transcripts/ directory exists

**Dependencies**: fs-extra, StorageService, PathResolver

**Key Methods**:
```javascript
class LinkManager {
  async createLink(videoId) // Create symlink and track in registry
  async removeAllLinks(videoId) // Delete all links for video
  async _trackLink(videoId, linkPath) // Add to registry.links array
  async _unlinkSafely(linkPath) // Delete link with ENOENT tolerance
}
```

**Link Structure**:
```
Source: ~/.transcriptor/transcripts/videoId.md
Target: ./transcripts/videoId.md (project-local)
Type: Symbolic link
```

#### MaintenanceService (src/services/MaintenanceService.js)

**Responsibility**: Validate data integrity and clean orphaned entries

**Key Functions**:
- Check registry entries have corresponding files (FR-7.1, TR-14)
- Remove orphaned registry entries
- Delete broken symbolic links
- Run before each processing operation

**Dependencies**: StorageService, LinkManager

**Key Methods**:
```javascript
class MaintenanceService {
  async validateIntegrity() // Check registry vs filesystem
  async _removeOrphanedEntry(videoId) // Clean up missing files
}
```

**Integrity Check Workflow** (TR-14):
1. Load registry
2. For each video ID in registry:
   - Check if transcript file exists
   - If missing: delete all tracked links, remove registry entry
3. Save updated registry

## Request Processing Flow

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant ProcessCmd as Process Command
    participant Maintenance as MaintenanceService
    participant TS as TranscriptService
    participant URLParser
    participant Storage as StorageService
    participant API as APIClient
    participant ScrapeAPI as Scrape Creators API
    participant LinkMgr as LinkManager
    participant FS as Filesystem

    User->>CLI: transcriptor (youtube.md exists)
    CLI->>ProcessCmd: execute()
    ProcessCmd->>ProcessCmd: Read youtube.md
    ProcessCmd->>URLParser: parseURLs(content)
    URLParser-->>ProcessCmd: videoIds[]

    ProcessCmd->>Maintenance: validateIntegrity()
    Maintenance->>Storage: loadRegistry()
    Storage->>FS: Read ~/.transcriptor/data.json
    FS-->>Storage: Registry data
    Storage-->>Maintenance: registry
    loop For each entry
        Maintenance->>Storage: transcriptExists(videoId)
        Storage->>FS: Check file exists
        alt File missing
            Maintenance->>LinkMgr: removeAllLinks(videoId)
            Maintenance->>Storage: Delete registry entry
        end
    end
    Maintenance->>Storage: saveRegistry()
    Storage->>FS: Atomic write data.json

    ProcessCmd->>TS: processBatch(videoIds)

    loop For each videoId
        TS->>TS: extractVideoId(url)
        TS->>Storage: loadRegistry()
        Storage-->>TS: registry
        TS->>Storage: transcriptExists(videoId)
        Storage->>FS: Check ~/.transcriptor/transcripts/id.md

        alt Cache Hit
            FS-->>Storage: File exists
            Storage-->>TS: true
            TS->>Storage: loadTranscript(videoId)
            Storage->>FS: Read transcript file
            FS-->>Storage: Transcript content
            Storage-->>TS: content
            Note over TS: Cache hit - skip API call
        else Cache Miss
            FS-->>Storage: File not found
            Storage-->>TS: false
            TS->>API: fetchTranscript(url)
            API->>API: Add x-api-key header
            API->>ScrapeAPI: POST /transcript {url}
            ScrapeAPI-->>API: {transcript_only_text}
            API->>API: Validate response
            API-->>TS: Transcript content

            TS->>Storage: saveTranscript(videoId, content)
            Storage->>FS: Write ~/.transcriptor/transcripts/id.md
            FS-->>Storage: Success

            TS->>Storage: updateRegistry(videoId, date)
            Storage->>FS: Atomic write data.json
        end

        TS->>LinkMgr: createLink(videoId)
        LinkMgr->>FS: Ensure ./transcripts/ directory
        LinkMgr->>FS: Create symlink ./transcripts/id.md
        FS-->>LinkMgr: Link created
        LinkMgr->>Storage: Add link path to registry
        Storage->>FS: Atomic write data.json

        TS-->>ProcessCmd: Success result
    end

    ProcessCmd->>ProcessCmd: Display summary
    ProcessCmd-->>CLI: Complete
    CLI-->>User: Summary output
```

### Request Flow Description

1. **User Input**: User runs `transcriptor` command with youtube.md file in current directory
2. **URL Parsing**: ProcessCommand reads youtube.md and extracts YouTube URLs using URLParser
3. **Integrity Check**: MaintenanceService validates registry against filesystem, removes orphaned entries
4. **Batch Processing**: TranscriptService processes URLs sequentially
5. **Cache Check**: For each video, check if transcript exists in cache (registry + file)
6. **API Fetch** (cache miss): Fetch transcript from Scrape Creators API with retry logic
7. **Storage**: Save transcript to ~/.transcriptor/transcripts/ immediately
8. **Registry Update**: Add entry to data.json with date_added and empty links array
9. **Link Creation**: Create symbolic link in ./transcripts/ pointing to central storage
10. **Link Tracking**: Add link path to registry entry
11. **Summary**: Display processing results (success count, cache hits, failures)

## Storage Architecture

```mermaid
graph TD
    A["~/.transcriptor/<br/>(Central Storage)"] --> B["data.json<br/>(Registry)"]
    A --> C["transcripts/"]

    C --> C1["dQw4w9WgXcQ.md<br/>(Video 1 transcript)"]
    C --> C2["jNQXAC9IVRw.md<br/>(Video 2 transcript)"]
    C --> C3["9bZkp7q19f0.md<br/>(Video N transcript)"]

    D["./project1/transcripts/<br/>(Project Local)"] --> D1["dQw4w9WgXcQ.md<br/>(symlink)"]
    D --> D2["jNQXAC9IVRw.md<br/>(symlink)"]

    E["./project2/transcripts/<br/>(Project Local)"] --> E1["dQw4w9WgXcQ.md<br/>(symlink)"]

    D1 -.->|"points to"| C1
    D2 -.->|"points to"| C2
    E1 -.->|"points to"| C1

    B --> F["Registry Entry:<br/>{<br/>  date_added: '2025-11-19',<br/>  links: [...]<br/>}"]

    style A fill:#e8f5e9
    style B fill:#fff3e0
    style C fill:#e8f5e9
    style C1 fill:#e3f2fd
    style C2 fill:#e3f2fd
    style C3 fill:#e3f2fd
    style D fill:#fce4ec
    style E fill:#fce4ec
    style D1 fill:#f3e5f5
    style D2 fill:#f3e5f5
    style E1 fill:#f3e5f5
    style F fill:#fff3e0
```

### Storage Structure Details

**Central Storage** (`~/.transcriptor/`):
- **Location**: User home directory, cross-platform
- **Purpose**: Single source of truth for all transcripts
- **Persistence**: Data persists across all projects
- **Contents**:
  - `data.json`: Registry tracking all transcripts and links
  - `transcripts/`: Directory containing transcript markdown files

**Transcript Files** (`~/.transcriptor/transcripts/{videoId}.md`):
- **Naming**: Video ID as filename (11-character alphanumeric)
- **Format**: Plain text markdown (no timestamps, no formatting)
- **Content**: `transcript_only_text` field from API response
- **Encoding**: UTF-8
- **Size limit**: 10MB maximum per TR specifications

**Registry File** (`~/.transcriptor/data.json`):
- **Format**: JSON with 2-space indentation
- **Schema**: `{videoId: {date_added, links}}`
- **Write Strategy**: Atomic write (temp file + rename, per TR-8)
- **Validation**: Structure validated on load, corrupted file regenerated

**Project-Local Links** (`./transcripts/{videoId}.md`):
- **Type**: Symbolic links (symlinks)
- **Target**: Points to central storage transcript
- **Purpose**: Project-specific access without file duplication
- **Creation**: Automatic on transcript processing
- **Tracking**: All link paths stored in registry entry

**Bidirectional Tracking**:
- Registry tracks which projects link to each transcript
- Enables complete cleanup when deleting transcript
- Supports orphan detection during integrity checks

## Module Responsibilities

### Services Layer

**TranscriptService** (`src/services/TranscriptService.js`):
- Interface: `processBatch(urls)`, `processVideo(videoId, url)`
- Responsibilities: Orchestrate transcript workflow, cache management, statistics
- Dependencies: StorageService, APIClient, LinkManager

**StorageService** (`src/services/StorageService.js`):
- Interface: `initialize()`, `loadRegistry()`, `saveRegistry()`, `saveTranscript()`, `loadTranscript()`
- Responsibilities: File persistence, registry operations, atomic writes
- Dependencies: fs-extra, PathResolver

**APIClient** (`src/services/APIClient.js`):
- Interface: `initialize()`, `fetchTranscript(videoUrl)`
- Responsibilities: HTTP communication, error handling, retry logic
- Dependencies: axios, ErrorHandler, URLValidator

**LinkManager** (`src/services/LinkManager.js`):
- Interface: `createLink(videoId)`, `removeAllLinks(videoId)`
- Responsibilities: Symbolic link creation, link tracking, cleanup
- Dependencies: fs-extra, StorageService, PathResolver

**MaintenanceService** (`src/services/MaintenanceService.js`):
- Interface: `validateIntegrity()`
- Responsibilities: Data integrity checks, orphan cleanup
- Dependencies: StorageService, LinkManager

### Utilities Layer

**PathResolver** (`src/utils/pathResolver.js`):
- Interface: `getStoragePath()`, `getTranscriptsPath()`, `getRegistryPath()`, `getLocalTranscriptsPath()`
- Responsibilities: Cross-platform path resolution
- Dependencies: path, process.env

**Validators** (`src/utils/validators.js`):
- Interface: `isValidDate()`, `sanitizeVideoId()`, `assertValidDate()`
- Responsibilities: Input validation, sanitization
- Dependencies: None

**URLParser** (`src/utils/URLParser.js`):
- Interface: `parseURLs(fileContent)`, `extractVideoId(url)`
- Responsibilities: YouTube URL parsing, video ID extraction
- Dependencies: YouTubeConstants (regex patterns)

**ConsoleFormatter** (`src/utils/ConsoleFormatter.js`):
- Interface: `formatSuccess()`, `formatError()`, `formatStats()`
- Responsibilities: Consistent console output formatting
- Dependencies: None

**StatisticsCalculator** (`src/utils/StatisticsCalculator.js`):
- Interface: `calculate(registry, transcriptsPath)`
- Responsibilities: Calculate metrics (count, size, date range)
- Dependencies: fs-extra

**ErrorHandler** (`src/utils/ErrorHandler.js`):
- Interface: `transformHttpError()`, `isRetryableError()`
- Responsibilities: Error classification and transformation
- Dependencies: APIClientConstants

**ResultFactory** (`src/utils/ResultFactory.js`):
- Interface: `createSuccess()`, `createError()`, `createCacheHit()`
- Responsibilities: Standardized result objects
- Dependencies: None

## Data Models

### Registry Entry Schema

```javascript
// Type definition
{
  [videoId: string]: {
    date_added: string,  // YYYY-MM-DD format
    links: string[]      // Absolute paths to symbolic links
  }
}

// Example
{
  "dQw4w9WgXcQ": {
    "date_added": "2025-11-19",
    "links": [
      "/Users/developer/project1/transcripts/dQw4w9WgXcQ.md",
      "/Users/developer/project2/transcripts/dQw4w9WgXcQ.md"
    ]
  },
  "jNQXAC9IVRw": {
    "date_added": "2025-11-18",
    "links": [
      "/Users/developer/project1/transcripts/jNQXAC9IVRw.md"
    ]
  }
}
```

**Field Descriptions**:
- `videoId` (key): 11-character YouTube video identifier
- `date_added`: ISO date (YYYY-MM-DD) when transcript first acquired
- `links`: Array of absolute paths to symbolic links in projects

**Validation Rules**:
- Only allowed keys: `date_added`, `links`
- `date_added` must match YYYY-MM-DD format
- `links` must be an array (can be empty)
- All link paths should be absolute

### Transcript File Format

```markdown
[Plain text content from transcript_only_text field]

Example content:
Hello and welcome to this video tutorial. Today we're going to learn about
JavaScript promises and async await patterns. Let's start with the basics...
```

**Characteristics**:
- No frontmatter or metadata
- No timestamps or speaker labels
- Plain text without markdown formatting
- UTF-8 encoding
- Line breaks preserved from API response

### Processing Result Object

```javascript
{
  success: boolean,         // Operation succeeded
  videoId: string,          // YouTube video ID
  source: string,           // 'cache' | 'api' | 'error'
  error: string | null,     // Error message if failed
  cached: boolean,          // Was cache hit
  linkCreated: boolean      // Was symbolic link created
}
```

## Key Design Patterns

### Cache-First Strategy

All transcript requests follow this priority:

1. **Check Registry**: Does video ID exist in data.json?
2. **Verify File**: Does transcript file exist on disk?
3. **Cache Hit**: If both true, load transcript from storage
4. **Cache Miss**: If either false, fetch from API

**Benefits**:
- Minimizes API calls (reduces costs, improves speed)
- Prevents duplicate API requests for same video
- Enables offline access to previously-fetched transcripts

**Implementation**: TranscriptService.\_checkCache() and \_getOrFetchTranscript()

### Atomic Writes for Crash Resilience

All registry and transcript writes use atomic operations:

1. **Write to Temporary File**: Create {filename}.tmp
2. **Rename to Final**: Rename .tmp to actual filename (atomic operation)
3. **Verify**: Confirm file exists after write

**Benefits**:
- Prevents partial writes during crashes
- Ensures data integrity
- Enables re-run to complete unfinished work

**Implementation**: StorageService.saveRegistry() and saveTranscript()

**Crash Recovery Example**:
- Process crashes after transcript saved but before registry update
- Re-run: Cache check fails (not in registry), fetch again
- Auto-maintenance: Detects orphaned file, adds to registry

### Symbolic Link Distribution

Transcripts are shared via symbolic links rather than copies:

**Approach**:
- Central storage: One authoritative copy in ~/.transcriptor/transcripts/
- Project access: Symbolic link in ./transcripts/ points to central copy
- Registry tracking: All link locations stored in registry

**Benefits**:
- Storage efficiency: Single copy serves multiple projects
- Consistency: All projects always see same content
- Easy updates: Change central file, all links reflect update

**Implementation**: LinkManager.createLink()

**Cross-Platform Considerations**:
- Windows requires proper path handling (absolute paths)
- macOS/Linux use standard symlink operations
- Force option overwrites existing links

### Sequential Processing

URLs are processed one at a time rather than concurrently:

**Rationale**:
- API rate limiting: Sequential prevents hitting 100/min limit quickly
- Error isolation: Individual failure doesn't affect batch
- Resource control: Limits memory usage for large batches
- Predictable behavior: Easier to debug and reason about

**Implementation**: TranscriptService.processBatch() uses for loop, not Promise.all()

## Cross-References to Code

### Entry Points
- CLI Router: `src/index.js`
- Main Command: `src/commands/process.js`
- Help Display: `src/commands/help.js`
- Statistics: `src/commands/data.js`
- Cleanup: `src/commands/clean.js`

### Core Services
- Transcript Workflow: `src/services/TranscriptService.js`
- Storage Operations: `src/services/StorageService.js`
- API Integration: `src/services/APIClient.js`
- Link Management: `src/services/LinkManager.js`
- Integrity Checks: `src/services/MaintenanceService.js`

### Utilities
- Path Resolution: `src/utils/pathResolver.js`
- URL Parsing: `src/utils/URLParser.js`
- Validation: `src/utils/validators.js`
- Error Handling: `src/utils/ErrorHandler.js`
- Console Output: `src/utils/ConsoleFormatter.js`

### Configuration
- API Constants: `src/constants/APIClientConstants.js`
- YouTube Patterns: `src/utils/YouTubeConstants.js`
- Log Templates: `src/utils/LogMessages.js`

## Dependency Graph

```
Commands
  ├─→ process.js → TranscriptService, MaintenanceService, StorageService
  ├─→ help.js → (no dependencies)
  ├─→ data.js → StorageService, StatisticsCalculator
  └─→ clean.js → StorageService, MaintenanceService

Services
  ├─→ TranscriptService → StorageService, APIClient, LinkManager, URLParser, Validators
  ├─→ StorageService → PathResolver, Validators
  ├─→ APIClient → ErrorHandler, ValidationHelpers, URLValidator
  ├─→ LinkManager → StorageService, PathResolver
  └─→ MaintenanceService → StorageService, LinkManager

Utilities
  ├─→ PathResolver → (Node.js path, os)
  ├─→ URLParser → YouTubeConstants
  ├─→ Validators → (no dependencies)
  ├─→ ErrorHandler → APIClientConstants
  └─→ ConsoleFormatter → (no dependencies)
```

## Performance Characteristics

**Sequential Processing**: One URL at a time prevents rate limiting
**Cache Optimization**: Registry loaded once per batch, not per video
**Atomic Writes**: Small overhead for crash resilience (temp file + rename)
**Symbolic Links**: Zero storage overhead for multi-project usage
**File I/O**: Minimal reads (registry once, transcripts on cache hit only)

**Bottlenecks**:
- API fetch time (30s timeout per video)
- Large batches (100+ videos) hit rate limit
- Registry write per video (can batch in future optimization)

## Scalability Considerations

**Current Design**:
- Handles up to 1000 videos efficiently
- Registry file size grows linearly (approximately 100 bytes per entry)
- Sequential processing limits throughput to ~100 videos/minute

**Optimization Opportunities** (future):
- Batch registry updates (write once per batch instead of per video)
- Parallel API requests (respect rate limit with queue)
- Registry indexing for large datasets (>10,000 videos)
- Compression for very large transcript files

## Security Architecture

**API Key Protection**:
- Loaded from .env (never hardcoded)
- Never logged or displayed
- Sanitized from error messages

**Path Validation**:
- Video IDs sanitized (alphanumeric + dash only)
- Path traversal prevented (validates video ID format)
- Absolute paths used throughout

**Error Message Sanitization**:
- API responses truncated in errors
- Sensitive data removed from logs
- User-facing errors provide guidance without exposing internals

## References

- **Functional Requirements**: FR-1 through FR-10
- **Technical Requirements**: TR-1 through TR-19
- **API Integration**: See `docs/API_INTEGRATION.md`
- **Data Flow**: See `docs/DATA_FLOW.md`
- **Contributing**: See `docs/CONTRIBUTING.md`
