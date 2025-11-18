# Technical Requirements

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
  commander: ^12.0.0  # CLI framework
  axios: ^1.7.0       # HTTP client
  fs-extra: ^11.0.0   # File operations
  dotenv: ^16.0.0     # Environment vars
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
  interfaces: [fetchTranscript, checkCache]
  dependencies: [StorageService, APIClient]

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
    links: array<string>|absolute_paths
```

### File Structure

```yaml
Storage:
  ~/.transcriptor/:
    data.json: registry
    transcripts/:
      {videoId}.md: content
```

## API Integration

### Scrape Creators API

```yaml
Endpoint: POST https://api.scrape-creators.com/transcript
Headers:
  x-api-key: {SCRAPE_CREATORS_API_KEY}
Request:
  url: string|youtube_url
Response:
  transcript_only_text: string
Errors: [400, 401, 429, 500]
Rate: 100/min
Timeout: 30s
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
  source: ~/.transcriptor/transcripts/{id}.md
  target: ./transcripts/{id}.md
  type: symbolic
  force: true
  track: registry[id].links.push(cwd)
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
```

## Performance Constraints

```yaml
Limits:
  max_concurrent: 1  # Sequential processing
  file_size: 10MB    # Max transcript size
  url_batch: 1000    # Max URLs per run
  api_timeout: 30s
  retry_delay: [1s, 2s, 4s]
```

## Security Mechanisms

```yaml
Security:
  api_key: env_only, never_logged
  paths: validate_traversal
  input: sanitize_video_id
  files: validate_extensions
```

## Data Persistence

### TR-16: Registry Persistence (implements FR-9)

```yaml
SaveRegistry:
  trigger: after_each_operation
  format: JSON.stringify(data, null, 2)
  method: atomic_write
  backup: none  # Immediate write strategy
```

### TR-17: Transcript Storage (implements FR-2.3)

```yaml
SaveTranscript:
  path: ~/.transcriptor/transcripts/{id}.md
  content: api.transcript_only_text
  format: plain_text
  encoding: utf-8
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
