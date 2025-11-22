# Functional Requirements

## Project Scope

**Testing Approach:** This project does not include automated tests (unit, integration, or E2E). The codebase is intentionally kept small and simple, making comprehensive testing infrastructure unnecessary. Manual verification during development is sufficient for this scope.

## Core Processing

### FR-1: URL Input Processing

FR-1.1: System shall read YouTube URLs from youtube.md file in current directory

- Input: One URL per line
- Processing: Trim whitespace, extract video ID from each URL
- Validation: Skip invalid URLs/formats

FR-1.2: System shall display help when no youtube.md exists

- Trigger: Missing youtube.md file
- Response: Display command usage information

### FR-2: Transcript and Metadata Acquisition

FR-2.1: System shall fetch transcripts for YouTube videos

- Input: YouTube video ID
- Output: Plain text transcript without timestamps
- Data: Extract transcript_only_text property from response

FR-2.2: System shall fetch video metadata

- Input: YouTube video ID
- Data collected: Video title (original), Channel name (author)
- Source: YouTube oEmbed API endpoint
- Timing: Fetched alongside transcript for new videos

FR-2.3: System shall check cache before fetching

- Condition: Video ID exists in data registry
- Action: Skip API call, use cached transcript and metadata

FR-2.4: System shall persist transcripts immediately

- Format: tr_{video-id}_{formatted-title}.md file
- Location: Both ~/.transcriptor/transcripts and project ./transcripts directories
- Content: Metadata section followed by transcript text
- Timing: Save after each successful fetch

FR-2.5: System shall format text for filenames

- Applied to: Video title AND channel name
- Transformation: Convert to lowercase, replace spaces with underscore
- Allowed characters: Alphanumeric, underscore, dash only
- Output: Sanitized text suitable for filesystem
- Storage: Formatted versions stored in data registry

FR-2.6: System shall retry metadata fetch on unknown_title

- Trigger: Formatted title equals "unknown_title" after fetch
- Retry strategy: Sleep 3 seconds, retry metadata fetch
- Maximum retries: 3 additional attempts after initial failure
- Final behavior: If still "unknown_title" after 3 retries, save with unknown_title
- Logging: Console log each retry attempt with reason
- Timing: Retries apply only to metadata fetch, not transcript fetch

## Storage Management

### FR-3: Centralized Repository

FR-3.1: System shall maintain user-wide storage location

- Location: ~/.transcriptor directory
- Structure: data.json registry + transcripts/ folder

FR-3.2: System shall track transcript metadata

```json
{
  "[video-id]": {
    "date_added": "YYMMDDTHHMM",
    "channel": "formatted_channel_name",
    "title": "formatted_video_title"
  }
}
```

- date_added format: YY (year) MM (month) DD (day) T (separator) HH (hour) MM (minute)
- channel: Formatted version using same sanitization as title
- title: Formatted version suitable for filenames

FR-3.3: System shall generate standardized YouTube URLs

- Input: Video ID
- Format: https://youtu.be/{video-id}
- Purpose: Consistent URL representation in transcript files

### FR-4: Link Distribution

FR-4.1: System shall create project-local access points

- Location: ./transcripts/ folder in current directory
- Type: Symbolic links to centralized storage
- Naming: tr_{video-id}_{formatted-title}.md

### FR-11: Transcript File Structure

FR-11.1: System shall structure transcript files with metadata headers

```markdown
# Transcript

## Information

Channel: {formatted_channel}
Title: {formatted_title}
Youtube ID: {video-id}
URL: {standardized_short_url}

## Content

[transcript text]
```

FR-11.2: Metadata presentation requirements

- Format: Markdown structure with sections
- Channel: Formatted version (sanitized)
- Title: Formatted version (sanitized)
- Youtube ID: Unique video identifier
- URL: Standardized short URL format (https://youtu.be/{video-id})

## Maintenance Operations

### FR-5: Data Statistics

FR-5.1: Command `transcriptor data` shall display:

- Total transcripts count
- Storage folder size
- Oldest transcript date
- Newest transcript date
- Per entry: Video ID, formatted channel, formatted title, date added (YYMMDDTHHMM format)

### FR-6: Cleanup Operations

FR-6.1: Command `transcriptor clean YYYY-MM-DD` shall:

- Input format: YYYY-MM-DD
- Match logic: Compare against date portion (YYMMDD) of date_added, ignore time (THHMM)
- Remove transcripts older than specified date
- Delete transcript .md files from centralized storage
- Exclude specified date from deletion

FR-6.2: Cleanup shall process per entry:

- Delete transcript file from ~/.transcriptor/transcripts
- Remove registry entry
- Save updated registry

### FR-7: Auto-Maintenance

FR-7.1: System shall validate integrity on each run

- Check: Each registry entry has corresponding file
- Action: Remove orphaned entries
- Timing: Before processing new URLs

## Command Interface

### FR-8: Available Commands

FR-8.1: `transcriptor` - Process youtube.md file
FR-8.2: `transcriptor help` - Display usage information
FR-8.3: `transcriptor data` - Show repository statistics
FR-8.4: `transcriptor clean YYYY-MM-DD` - Remove old transcripts
FR-8.5: `transcriptor --rag-generator` - Process youtube.md file with RAG generator execution
FR-8.6: `transcriptor --rag-generator-gemini` - Process youtube.md file with RAG generator Gemini execution

## RAG Generator Integration

### FR-12: Automated RAG Processing

FR-12.1: System shall support RAG generator activation via CLI argument

- Argument: `--rag-generator`
- Behavior: Activates automated RAG processing after transcript completion
- Applicability: Optional feature, disabled by default

FR-12.2: System shall execute RAG generator after successful processing

- Trigger: All transcripts from youtube.md processed successfully
- Execution context: ./transcripts directory
- Command: `claude --dangerously-skip-permissions -p /rag-generator`
- Timing: Executes only after main transcript processing completes

FR-12.3: RAG generator execution constraints

- Condition: Only executes if all transcript processing succeeds
- Context: Command runs within ./transcripts folder
- Purpose: Enables automated Retrieval-Augmented Generation processing of fetched transcripts
- Failure handling: If RAG command fails, system logs error but does not fail transcript processing

### FR-13: RAG Generator Gemini Integration

FR-13.1: System shall support RAG generator Gemini activation via CLI argument

- Argument: `--rag-generator-gemini`
- Behavior: Activates automated RAG Gemini processing after transcript completion
- Applicability: Optional feature, disabled by default
- Exclusivity: Cannot be used simultaneously with --rag-generator

FR-13.2: System shall execute RAG generator Gemini after successful processing

- Trigger: All transcripts from youtube.md processed successfully
- Execution context: ./transcripts directory
- Command: `{projectRoot}/scripts/gemini-rag-generator.sh`
- Timing: Executes only after main transcript processing completes

FR-13.3: RAG generator Gemini execution constraints

- Condition: Only executes if all transcript processing succeeds
- Context: Command runs within ./transcripts folder
- Purpose: Enables automated Retrieval-Augmented Generation processing using Gemini model
- Failure handling: If RAG command fails, system logs error but does not fail transcript processing
- Mutual exclusivity: If both --rag-generator and --rag-generator-gemini are provided, system should error

## Data Integrity

### FR-9: Registry Operations

FR-9.1: System shall use atomic writes

- Method: Complete file rewrite for each change
- Timing: After each transcript processed
- Purpose: Maintain consistency during crashes

FR-9.2: System shall preserve data on failure

- Behavior: Completed transcripts remain accessible
- Recovery: Re-run processes unfinished URLs

## Error Handling

### FR-10: Failure Recovery

FR-10.1: System shall continue after individual failures

- Skip failed URLs
- Process remaining URLs
- Preserve successful operations

FR-10.2: System shall handle missing resources

- Missing files: Clean registry entry
- Invalid URLs: Skip, process next

## Business Rules

### BR-1: Cache Priority

- Always check cache before API calls
- Use existing transcripts when available

### BR-2: Processing Order

- Process URLs sequentially
- Complete each operation before next
- Save immediately after fetch

### BR-3: Date Handling

- Registry storage format: YYMMDDTHHMM (includes date and time)
- User input format: YYYY-MM-DD
- Cleanup matching: Compare date portion only (YYMMDD), ignore time
- Clean operations exclude boundary date
- Track first fetch timestamp (date and time)
