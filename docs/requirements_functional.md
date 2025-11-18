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

### FR-2: Transcript Acquisition

FR-2.1: System shall fetch transcripts for YouTube videos

- Input: YouTube video ID
- Output: Plain text transcript without timestamps
- Data: Extract transcript_only_text property from response

FR-2.2: System shall check cache before fetching

- Condition: Video ID exists in data registry
- Action: Skip API call, use cached transcript

FR-2.3: System shall persist transcripts immediately

- Format: [video-id].md file
- Content: Plain transcript text only
- Timing: Save after each successful fetch

## Storage Management

### FR-3: Centralized Repository

FR-3.1: System shall maintain user-wide storage location

- Location: ~/.transcriptor directory
- Structure: data.json registry + transcripts/ folder

FR-3.2: System shall track transcript metadata

```json
{
  "[video-id]": {
    "date_added": "YYYY-MM-DD",
    "links": ["path1", "path2"]
  }
}
```

### FR-4: Link Distribution

FR-4.1: System shall create project-local access points

- Location: ./transcripts/ folder in current directory
- Type: Symbolic links to centralized storage
- Naming: [video-id].md

FR-4.2: System shall track all link locations

- Update: Add path to links array for each creation
- Purpose: Enable complete cleanup

## Maintenance Operations

### FR-5: Data Statistics

FR-5.1: Command `transcriptor data` shall display:

- Total transcripts count
- Storage folder size
- Oldest transcript date
- Newest transcript date

### FR-6: Cleanup Operations

FR-6.1: Command `transcriptor clean YYYY-MM-DD` shall:

- Remove transcripts older than specified date
- Delete associated .md files
- Remove all tracked symbolic links
- Exclude specified date from deletion

FR-6.2: Cleanup shall process per entry:

- Delete all links for video ID
- Delete transcript file
- Remove registry entry
- Save updated registry

### FR-7: Auto-Maintenance

FR-7.1: System shall validate integrity on each run

- Check: Each registry entry has corresponding file
- Action: Remove orphaned entries and their links
- Timing: Before processing new URLs

## Command Interface

### FR-8: Available Commands

FR-8.1: `transcriptor` - Process youtube.md file
FR-8.2: `transcriptor help` - Display usage information
FR-8.3: `transcriptor data` - Show repository statistics
FR-8.4: `transcriptor clean YYYY-MM-DD` - Remove old transcripts

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

- Missing links: Skip deletion, continue
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

### BR-3: Link Management

- Track all created links
- Remove links when source deleted
- Maintain bidirectional registry

### BR-4: Date Handling

- Use YYYY-MM-DD format
- Clean operations exclude boundary date
- Track first fetch date only
