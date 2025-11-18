# Project Overview B

## Purpose

The `transcriptor` CLI tool is designed to streamline the process of extracting and managing YouTube video transcripts for content creators, researchers, and developers who need text versions of YouTube content. By providing a centralized caching system and intelligent API management, it eliminates redundant API calls and enables efficient offline access to previously fetched transcripts across multiple projects.

---

## Project Status

**Implementation Progress**: ~5% Complete (based on codebase analysis)

- Completed Sections: Basic project structure, npm package configuration
- Current Focus: No active implementation (project in initial state)
- Pending Work: All core functionality (transcript fetching, storage, linking, maintenance commands)

**Current State**:

- Project structure initialized with package.json and basic entry point
- Empty placeholder for main functionality (src/index.js prints "hello i'm transcriptor")
- Documentation framework in place but requirements and tasks files are empty
- Ready for full implementation following the specification in dev/request.md

---

## Core Functionality

The system converts YouTube video URLs into locally stored Markdown transcript files with intelligent caching and centralized storage management.

### Transcript Fetching

- **YouTube URL Processing**: Reads URLs from a `youtube.md` file in the current directory (one URL per line)
  - Status: ⏳ Planned
  - Extracts YouTube video IDs from URLs
  - Validates and trims input lines

- **API Integration**: Fetches transcripts via Scrape Creators API
  - Status: ⏳ Planned
  - Uses API key from environment variables
  - Extracts `transcript_only_text` property (plain text without timestamps)
  - Implements intelligent caching to avoid redundant API calls

### Centralized Storage System

- **Home Directory Cache**: Maintains `~/.transcriptor/` folder as central storage
  - Status: ⏳ Planned
  - Contains `data.json` metadata database
  - Contains `transcripts/` subfolder with all transcript MD files
  - Tracks transcript metadata: date added, link locations

- **Symbolic Link Management**: Creates links from project folders to central cache
  - Status: ⏳ Planned
  - Links placed in `transcripts/` subfolder of current working directory
  - Avoids file duplication across projects
  - Maintains link registry in data.json for cleanup operations

### Maintenance Commands

- **Statistics Display** (`transcriptor data`): Shows cache information
  - Status: ⏳ Planned
  - Total transcripts count
  - Total storage size
  - Oldest and newest transcript dates

- **Cleanup Command** (`transcriptor clean YYYY-MM-DD`): Removes old transcripts
  - Status: ⏳ Planned
  - Deletes entries older than specified date (excluding the date itself)
  - Removes associated MD files
  - Cleans up all symbolic links tracked in links array

- **Auto-Maintenance**: Validates data integrity on every run
  - Status: ⏳ Planned
  - Verifies each data.json entry has corresponding transcript file
  - Auto-cleans orphaned entries and broken links

---

## System Architecture

### High-Level Design

The system follows a CLI-driven architecture with a centralized storage pattern. It operates as a globally-linked npm package that manages a user-wide cache of YouTube transcripts, creating project-specific symbolic links to avoid duplication.

```folders
User's Machine
├── ~/.transcriptor/               # Centralized cache (single source of truth)
│   ├── data.json                 # Metadata database
│   └── transcripts/              # All transcript MD files
│       └── {youtube-id}.md
│
├── Project A/
│   ├── youtube.md                # Input: URLs to fetch
│   └── transcripts/              # Symlinks to ~/.transcriptor/transcripts/
│       └── {youtube-id}.md -> ~/.transcriptor/transcripts/{youtube-id}.md
│
└── Project B/
    ├── youtube.md
    └── transcripts/              # Different project, same cache
        └── {youtube-id}.md -> ~/.transcriptor/transcripts/{youtube-id}.md
```

### Key Components

- **CLI Entry Point** (`src/index.js`): Command parser and workflow orchestrator
  - Implementation: Basic placeholder exists
  - Responsibilities: Argument parsing, command routing, help display

- **URL Parser**: Extracts YouTube video IDs from URLs
  - Implementation: ⏳ Planned
  - Handles various YouTube URL formats

- **API Client**: Interfaces with Scrape Creators API
  - Implementation: ⏳ Planned
  - Manages authentication via environment variable
  - Fetches transcript_only_text property

- **Storage Manager**: Handles centralized file system operations
  - Implementation: ⏳ Planned
  - Manages ~/.transcriptor directory structure
  - Creates and tracks symbolic links

- **Data Manager**: Manages data.json metadata database
  - Implementation: ⏳ Planned
  - Atomic file rewrites for consistency
  - Integrity validation and auto-cleanup

### Technology Stack

- **Language/Runtime**: Node.js (JavaScript)
- **Package Manager**: npm
- **Distribution Method**: Local linking via `npm link` (not published to npm registry)
- **External API**: Scrape Creators API (for transcript fetching)
- **File System Operations**: Native Node.js `fs` module (anticipated)
- **CLI Framework**: To be determined (native or commander.js/yargs)

---

## Data Management

### Primary Data Entities

- **Transcript Entry** (stored in `~/.transcriptor/data.json`):

  ```json
  {
    "[youtube-id]": {
      "date_added": "YYYY-MM-DD",
      "links": [
        "/absolute/path/to/project/transcripts",
        "/another/project/path/transcripts"
      ]
    }
  }
  ```

  - Key: YouTube video ID (string)
  - date_added: ISO date string of first fetch
  - links: Array of absolute paths where transcript is linked

- **Transcript File** (`~/.transcriptor/transcripts/{youtube-id}.md`):
  - Plain text markdown file
  - Contains only the transcript text (no timestamps, metadata, or formatting)
  - Named after YouTube video ID

### Data Flow

1. **Input Phase**: User creates `youtube.md` in current directory with YouTube URLs (one per line)
2. **Processing Phase**:
   - Script parses youtube.md and extracts video IDs
   - Checks each ID against data.json cache
   - For cached IDs: Creates symbolic link only
   - For new IDs: Calls Scrape Creators API → Saves to ~/.transcriptor/transcripts/ → Updates data.json → Creates symbolic link
3. **Output Phase**: Symbolic links created in `./transcripts/` folder pointing to centralized cache
4. **Persistence**: After each transcript operation, data.json is atomically rewritten to ensure consistency

### Data Consistency Strategy

- **Atomic Writes**: data.json is completely rewritten after each modification (never partial edits)
- **Write-After-Each**: Changes are persisted after each individual transcript operation, not batched
- **Crash Recovery**: If interrupted, youtube.md is not modified, so rerunning script will pick up where it left off
- **Integrity Checks**: Every execution validates data.json entries against actual transcript files

---

## User Journey

### Primary Use Case: Fetching New Transcripts

1. **Setup**: User navigates to project directory containing `youtube.md` file with URLs
2. **Execution**: User runs `transcriptor` command
3. **Processing**: Script reads URLs, checks cache, fetches missing transcripts via API
4. **Results**: Creates `transcripts/` folder with symbolic links to all requested transcripts
5. **Feedback**: Terminal output shows progress (fetched vs. cached)

### Secondary Use Case: Cache Management

1. **Inspection**: User runs `transcriptor data` to see cache statistics
2. **Decision**: Based on size/age, user decides to clean old transcripts
3. **Cleanup**: User runs `transcriptor clean 2025-01-01` to remove old entries
4. **Validation**: Script removes files, links, and data.json entries for old transcripts

### Edge Case: Missing youtube.md

1. **Execution**: User runs `transcriptor` in directory without `youtube.md`
2. **Response**: Script displays help message (same as `transcriptor help`)
3. **User Action**: User creates youtube.md or navigates to correct directory

---

## Integration Points

### Outbound Integrations

- **Scrape Creators API**: External service for YouTube transcript extraction
  - Protocol: HTTPS REST API (assumed)
  - Authentication: API key from environment variable
  - Data Retrieved: `transcript_only_text` property (plain text transcript)
  - Usage Pattern: Called only when transcript not in cache

---

## Operational Characteristics

### Performance Requirements

- **Caching Efficiency**: Must check local cache before API call (target: <50ms cache lookup)
- **API Rate Limiting**: Should respect Scrape Creators API limits (specific limits TBD)
- **Incremental Processing**: Persists each transcript immediately to support interruption/resume

### Reliability & Resilience

- **Error Handling Strategy**:
  - Invalid YouTube URLs: Skip with warning, continue processing
  - API failures: Log error, skip transcript, continue with next
  - File system errors: Halt execution with clear error message

- **Fallback Mechanisms**:
  - If data.json corrupted: Could rebuild from transcripts folder (future enhancement)
  - If symlink creation fails: Log warning but don't fail entire operation

- **Data Backup**:
  - Centralized storage in ~/.transcriptor provides implicit backup
  - User responsible for backing up ~/.transcriptor folder

### Security Considerations

- **Authentication**: API key stored in environment variable (not hardcoded)
- **File Permissions**: Standard user permissions for ~/.transcriptor folder
- **Data Privacy**: Transcripts stored locally only, not transmitted elsewhere
- **Input Validation**: YouTube URLs validated before processing

---

## Development Workflow

### Project Structure

```
nodejs-youtube-transcriptor/
├── src/
│   └── index.js          # Main entry point (CLI handler)
├── docs/                 # Project documentation
│   ├── project_overview.md
│   ├── requirements_functional.md
│   └── requirements_technical.md
├── dev/                  # Development artifacts
│   ├── tasks.md         # Implementation tasks
│   ├── request.md       # Original project specification
│   ├── agents.md        # Claude Code agent instructions
│   └── plans/           # Implementation plans
│       └── archived/    # Historical plans
├── .claude/
│   └── CLAUDE.md        # Project framework definition
├── package.json         # npm package configuration
└── README.md           # Basic project description
```

### Key Development Patterns

- **Atomic Data Operations**: Always rewrite data.json completely to ensure consistency
- **Fail-Safe Processing**: Write each transcript immediately after fetching (don't batch)
- **Cache-First Strategy**: Always check local cache before external API calls
- **Symbolic Links**: Use symlinks instead of file copies for efficiency

### Testing Strategy

- **Unit Tests**: ⏳ Planned
  - YouTube ID extraction from various URL formats
  - Data.json read/write operations
  - Link tracking logic

- **Integration Tests**: ⏳ Planned
  - End-to-end transcript fetching workflow
  - Cache hit/miss scenarios
  - Cleanup command validation

- **Manual Testing**:
  - Test with various YouTube URL formats
  - Verify symlink creation across different OS
  - Validate data.json integrity after interruptions

---

## Scope Boundaries

### In Scope

- Fetching YouTube video transcripts via Scrape Creators API
- Centralized caching system in ~/.transcriptor directory
- Symbolic link management for project-specific access
- Metadata tracking in data.json (date added, link locations)
- Maintenance commands: data statistics, cleanup by date
- Auto-maintenance: integrity checks and orphaned entry cleanup
- Help command and error messages
- Processing youtube.md input file format

### Out of Scope

- Publishing package to public npm registry (using npm link instead)
- Transcript formatting or timestamp preservation (only plain text)
- Video metadata extraction (title, description, etc.)
- Multiple transcript language support
- GUI or web interface
- Transcript editing or annotation features
- Integration with other transcript services beyond Scrape Creators
- Automated backup or sync to cloud storage
- User authentication or multi-user support
- Transcript search or indexing capabilities

### Future Considerations

- Support for additional transcript APIs beyond Scrape Creators
- Transcript format customization (timestamps, formatting options)
- Export transcripts to other formats (PDF, DOCX, etc.)
- Batch processing optimizations and parallel API requests
- Interactive mode for URL selection
- Configuration file for user preferences
- Progress bars and enhanced terminal UI
- Transcript metadata enrichment (video title, duration, etc.)

---

## Key Business Rules

1. **Single Source of Truth**: All transcripts stored in ~/.transcriptor/transcripts/ exactly once; projects access via symlinks
2. **Cache Before API**: Always check data.json cache before making API call to avoid redundant requests and API usage
3. **Atomic Persistence**: data.json must be completely rewritten after every modification to ensure consistency
4. **Write-Per-Operation**: Each transcript fetch/delete operation is persisted immediately, not batched
5. **Link Registry**: All symbolic link locations must be tracked in data.json links array for proper cleanup
6. **Date Exclusivity**: Clean command removes transcripts older than specified date, excluding the date itself
7. **Integrity First**: Every execution validates data.json against actual files and auto-cleans discrepancies
8. **No API on Missing File**: If youtube.md doesn't exist, display help instead of erroring
9. **One URL Per Line**: youtube.md format is strictly one YouTube URL per line (after trimming)
10. **Plain Text Only**: Transcript files contain only the transcript_only_text value, no additional metadata

---

## Configuration & Deployment

### Environment Variables

- `SCRAPE_CREATORS_API_KEY`: API key for Scrape Creators service (required for transcript fetching)

### Installation & Setup

```bash
# Clone repository
git clone https://github.com/michaellinhardt/nodejs-youtube-transcriptor.git
cd nodejs-youtube-transcriptor

# Install dependencies
npm install

# Link globally for command-line access
npm link

# Uninstall
npm unlink nodejs-youtube-transcriptor
```

### Usage

```bash
# Basic usage (fetches transcripts for URLs in youtube.md)
transcriptor

# Display cache statistics
transcriptor data

# Clean old transcripts (removes entries before specified date)
transcriptor clean 2025-01-01

# Display help
transcriptor help
```

---

## Documentation & Resources

### Core Project Documentation (docs/)

- `docs/project_overview.md`: This document - comprehensive project reference
- `docs/requirements_functional.md`: Functional requirements (currently empty, to be populated)
- `docs/requirements_technical.md`: Technical specifications (currently empty, to be populated)

### Development Artifacts (dev/)

- `dev/request.md`: Original project specification and detailed feature description
- `dev/tasks.md`: Implementation task tracking (currently empty, to be populated)
- `dev/agents.md`: Claude Code agent-specific instructions
- `dev/plans/`: Implementation plans for specific features
- `dev/plans/archived/`: Historical implementation plans and documents

### External Resources

- **Scrape Creators API Documentation**: API provider for YouTube transcript extraction (URL TBD)
- **Repository**: <https://github.com/michaellinhardt/nodejs-youtube-transcriptor>
- **npm link Documentation**: <https://docs.npmjs.com/cli/v8/commands/npm-link>

---

## Project Management

- **Framework**: CLAUDE.md (project structure and workflow guidelines)
- **Documentation Standard**: All documentation maintained in docs/
- **Task Tracking**: dev/tasks.md with hierarchical structure (X.0 > X.X > X.X.X)
- **Planning Artifacts**: Implementation plans in dev/plans/
- **Version Control**: Git repository with main branch

---

## Contact & Ownership

- **Project Owner**: michaellinhardt
- **Repository**: <https://github.com/michaellinhardt/nodejs-youtube-transcriptor>
- **License**: MIT
- **Last Updated**: 2025-11-17
- **Based on Specification**: dev/request.md (project requirements document)

---

## Implementation Notes

### Current State Analysis

The project is in its initial setup phase with:

- Package.json configured with proper bin entry for CLI command
- Basic entry point (src/index.js) as placeholder
- Git repository initialized
- Documentation structure in place per CLAUDE.md framework

### Next Steps for Implementation

1. **Requirements Definition**: Populate requirements_functional.md and requirements_technical.md from dev/request.md
2. **Task Breakdown**: Create detailed task hierarchy in dev/tasks.md
3. **Implementation Plan**: Create plan_YYMMDD_X.X_feature.md files for major features
4. **Core Development**:
   - Implement CLI argument parsing and command routing
   - Build YouTube URL parser and ID extractor
   - Integrate Scrape Creators API client
   - Develop centralized storage manager
   - Implement data.json manager with atomic writes
   - Create symbolic link management system
   - Build maintenance commands (data, clean)
   - Add auto-maintenance integrity checks
5. **Testing & Validation**: Unit tests, integration tests, manual testing across platforms
6. **Documentation**: Update all docs/ files to reflect implemented features

### Known Dependencies

- Node.js runtime environment
- Scrape Creators API access (requires API key)
- npm for package management
- File system support for symbolic links (platform-specific considerations)
