# Transcriptor

A command-line tool that transforms YouTube videos into locally-stored markdown transcript files with intelligent caching. Transcriptor eliminates redundant API calls by maintaining a centralized repository that enables transcript sharing across multiple projects.

![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![npm Version](https://img.shields.io/badge/npm-%3E%3D8.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
[![GitHub](https://img.shields.io/badge/GitHub-michaellinhardt%2Fnodejs--youtube--transcriptor-blue)](https://github.com/michaellinhardt/nodejs-youtube-transcriptor)

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Commands](#commands)
  - [Main Command: Process Transcripts](#main-command-process-transcripts)
  - [Help Command](#help-command)
  - [Data Statistics Command](#data-statistics-command)
  - [Clean Command](#clean-command)
- [Architecture](#architecture)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Quick Start

1. **Install globally:**

   ```bash
   npm install -g nodejs-youtube-transcriptor
   ```

2. **Configure API key:**

   ```bash
   echo "SCRAPE_CREATORS_API_KEY=your_api_key_here" > .env
   ```

3. **Create `youtube.md` with video URLs and process:**
   ```bash
   echo "https://www.youtube.com/watch?v=dQw4w9WgXcQ" > youtube.md
   transcriptor
   ```

That's it! Your transcripts are now in `./transcripts/` as markdown files.

## Installation

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- Valid API key from [Scrape Creators](https://api.scrapecreators.com)

### Global Installation

Install Transcriptor globally to make it available as a command-line tool from any directory:

```bash
npm install -g nodejs-youtube-transcriptor
```

Verify the installation:

```bash
transcriptor help
```

**Expected output:**

```
Transcriptor v1.0.0
YouTube transcript extraction and management tool
...
```

### Local Development Installation

For contributors and developers working on Transcriptor itself:

```bash
git clone https://github.com/michaellinhardt/nodejs-youtube-transcriptor.git
cd nodejs-youtube-transcriptor
npm install
npm link
```

The `npm link` command creates a global symlink to your local development version, allowing you to test changes immediately.

### Verify Installation

After installation, confirm Transcriptor is accessible:

```bash
transcriptor --version
```

This should display the version number (e.g., `1.0.0`).

## Configuration

### API Key Setup

Transcriptor requires an API key from [Scrape Creators](https://api.scrapecreators.com) to fetch YouTube transcripts.

**Step 1: Obtain API Key**

1. Visit [https://api.scrapecreators.com](https://api.scrapecreators.com)
2. Sign up or log in to your account
3. Generate an API key from the dashboard

**Step 2: Create `.env` File**

In your project directory or globally, create a `.env` file with your API key:

```bash
SCRAPE_CREATORS_API_KEY=your_api_key_here
```

**Example `.env` file:**

```env
# Scrape Creators API Configuration
# Obtain your API key from: https://api.scrapecreators.com
SCRAPE_CREATORS_API_KEY=sk_live_abc123xyz789
```

**Note:** The `.env` file is loaded from the current working directory when you run `transcriptor`. For global configuration, you can also set the environment variable system-wide.

### Directory Structure

Transcriptor creates a centralized storage directory in your home folder:

```
~/.transcriptor/
├── data.json              # Registry tracking all transcripts and link locations
└── transcripts/           # Actual transcript files
    ├── dQw4w9WgXcQ.md
    ├── jNQXAC9IVRw.md
    └── ...
```

When you run `transcriptor` in a project directory, it creates a `./transcripts/` folder with symbolic links to the centralized storage:

```
your-project/
├── youtube.md             # Input file with YouTube URLs
└── transcripts/           # Symbolic links to ~/.transcriptor/transcripts/
    ├── dQw4w9WgXcQ.md -> ~/.transcriptor/transcripts/dQw4w9WgXcQ.md
    └── jNQXAC9IVRw.md -> ~/.transcriptor/transcripts/jNQXAC9IVRw.md
```

### Permissions

Transcriptor requires:

- **Read/write** access to `~/.transcriptor` directory (created automatically)
- **Read** access to `youtube.md` in the current directory
- **Write** access to create `./transcripts/` directory and symbolic links

## Commands

### Main Command: Process Transcripts

**Purpose:** Extract transcripts from YouTube URLs listed in `youtube.md` file.

**Syntax:**

```bash
transcriptor
```

**Prerequisites:**

- `youtube.md` file exists in current directory
- API key configured in `.env` file

**Workflow:**

1. Reads YouTube URLs from `youtube.md` (one per line)
2. Extracts video IDs from each URL
3. Checks cache for existing transcripts
4. Fetches missing transcripts from API
5. Saves transcripts to `~/.transcriptor/transcripts/`
6. Creates symbolic links in `./transcripts/`
7. Updates registry with metadata and link locations

**Example:**

Input (`youtube.md`):

```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/jNQXAC9IVRw
```

Command:

```bash
$ transcriptor
```

Output:

```
Processing youtube.md...
[✓] dQw4w9WgXcQ - cached (0ms)
[✓] jNQXAC9IVRw - fetched (1250ms) - 4.2KB
Complete: 2 processed, 0 errors, 1 cached
```

Result: `./transcripts/` folder created with two symbolic links pointing to centralized storage.

**Notes:**

- Processing is sequential (one URL at a time)
- Cached transcripts skip API calls entirely
- Each transcript is saved immediately after fetching (crash-resilient)
- Invalid URLs or API errors are skipped with error messages
- Re-running the command processes only new/failed URLs

**Supported URL Formats:**

```
https://www.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
https://www.youtube.com/watch?v=VIDEO_ID&other_params
```

### Help Command

**Purpose:** Display comprehensive usage information.

**Syntax:**

```bash
transcriptor help
```

**Example:**

```bash
$ transcriptor help
```

Output:

```
Transcriptor v1.0.0
YouTube transcript extraction and management tool

USAGE:
  transcriptor [command] [options]

COMMANDS:
  ...
```

**Notes:**

- Help is also displayed when `youtube.md` is missing
- Use `transcriptor --version` for version information only

### Data Statistics Command

**Purpose:** Display repository statistics including total transcripts, storage size, and date range.

**Syntax:**

```bash
transcriptor data
```

**Example:**

```bash
$ transcriptor data
```

Output:

```
Transcriptor Repository Statistics
===================================

Total Transcripts: 42
Storage Size: 12.4 MB
Date Range: 2024-01-15 to 2024-11-19

Oldest transcript: 2024-01-15
Newest transcript: 2024-11-19
```

**Notes:**

- Storage size includes all transcript files in `~/.transcriptor/transcripts/`
- Date range reflects `date_added` field from registry
- Use this command before cleanup operations to understand impact

### Clean Command

**Purpose:** Remove transcripts older than a specified date to manage storage.

**Syntax:**

```bash
transcriptor clean YYYY-MM-DD
```

**Parameters:**

- `YYYY-MM-DD`: Date cutoff (transcripts added before this date will be deleted)
- Date is **exclusive** (transcripts from this exact date are preserved)

**Example:**

```bash
$ transcriptor clean 2024-06-01
```

Output:

```
Cleaning transcripts older than 2024-06-01...
[✓] dQw4w9WgXcQ - deleted (added 2024-01-15)
[✓] abc123xyz78 - deleted (added 2024-03-22)
Complete: 2 transcripts removed, 40 remaining
```

**Workflow:**

1. Loads registry from `~/.transcriptor/data.json`
2. Filters transcripts with `date_added` before specified date
3. For each transcript:
   - Deletes all symbolic links tracked in registry
   - Deletes transcript file from central storage
   - Removes registry entry
4. Saves updated registry

**Notes:**

- Date is exclusive: `clean 2024-06-01` preserves transcripts from 2024-06-01 onward
- All symbolic links are automatically removed
- Operation is permanent (no undo mechanism)
- Run `transcriptor data` first to preview impact
- Handles missing links gracefully (continues with warning)

## Architecture

### Storage Strategy

Transcriptor uses a **centralized caching approach** storing all transcripts in a single `~/.transcriptor` directory. This strategy:

- **Eliminates duplicate storage** across projects (single copy per transcript)
- **Reduces API calls** for repeated videos (cache-first processing)
- **Enables transcript reuse** across multiple projects effortlessly
- **Maintains single authoritative copy** per video ID

### Component Overview

```
┌─────────────────┐
│   youtube.md    │  Input: YouTube URLs (one per line)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  URL Parser     │  Extract video IDs via regex
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Cache Check    │  Query registry for existing transcripts
└────────┬────────┘
         │
         ├─── Cached ──────┐
         │                 │
         ▼                 ▼
┌─────────────────┐   ┌─────────────────┐
│   API Fetch     │   │  Use Existing   │
│ (with retries)  │   └────────┬────────┘
└────────┬────────┘            │
         │                     │
         ▼                     │
┌─────────────────┐            │
│ Save to Storage │            │
│ (~/.transcriptor)│           │
└────────┬────────┘            │
         │                     │
         ▼                     │
┌─────────────────┐            │
│ Update Registry │◄───────────┘
│   (data.json)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Create Symlinks │  Link to ./transcripts/ in project
└─────────────────┘
```

### Data Flow

**Processing Workflow (TR-7):**

1. **URL Input:** Read `youtube.md` from current directory
2. **Parse:** Extract video IDs using regex (supports youtube.com and youtu.be)
3. **Cache Check:** Query `~/.transcriptor/data.json` registry
4. **Decision:**
   - **If cached:** Use existing transcript (skip API call)
   - **If missing:** Fetch from Scrape Creators API
5. **Persist:** Save transcript to `~/.transcriptor/transcripts/{videoId}.md`
6. **Link:** Create symbolic link in `./transcripts/{videoId}.md`
7. **Track:** Update registry with metadata and link location
8. **Atomic Save:** Persist updated registry to disk

**Cache-First Strategy:**

Every video ID is checked against the registry before making API requests. This approach:

- Minimizes API consumption (rate limits, costs)
- Improves performance (instant retrieval vs. network latency)
- Ensures consistency (single source of truth)

### Symbolic Linking

Transcriptor creates **symbolic links** from project directories to centralized storage:

**Example:**

```
./transcripts/dQw4w9WgXcQ.md → ~/.transcriptor/transcripts/dQw4w9WgXcQ.md
```

**Benefits:**

- Transparent file access (applications see them as regular files)
- No file duplication (storage efficiency)
- Automatic updates (if central file changes, all links reflect it)
- Cross-platform support (works on macOS, Linux, Windows with appropriate permissions)

**Cross-Platform Considerations:**

- **macOS/Linux:** Native symbolic link support
- **Windows:** Requires administrator privileges or developer mode enabled
- **WSL:** Full symbolic link support within Linux filesystem

### Registry System

The registry (`~/.transcriptor/data.json`) tracks all transcripts and their usage:

**Schema:**

```json
{
  "dQw4w9WgXcQ": {
    "date_added": "2024-11-19",
    "links": ["/Users/username/project-a/transcripts", "/Users/username/project-b/transcripts"]
  },
  "jNQXAC9IVRw": {
    "date_added": "2024-11-18",
    "links": ["/Users/username/project-a/transcripts"]
  }
}
```

**Fields:**

- `date_added`: ISO date when transcript was first fetched (YYYY-MM-DD)
- `links`: Array of absolute paths where symbolic links exist

**Usage:**

- Cache validation (check if transcript exists)
- Link cleanup (remove all links when transcript deleted)
- Statistics calculation (count, date range)
- Integrity validation (detect orphaned entries)

### Crash Recovery

Transcriptor implements crash-resilient persistence:

**Atomic Operations (TR-8):**

1. Write updated registry to temporary file (`data.json.tmp`)
2. Rename temporary file to `data.json` (atomic filesystem operation)
3. If crash occurs during write, original `data.json` remains intact

**Per-Transcript Persistence:**

- Each transcript is saved immediately after fetching
- Registry updated after each successful operation
- Re-running command processes only unfinished URLs

**Integrity Validation (FR-7):**

- On each run, validates registry against actual files
- Removes orphaned entries (registry reference without file)
- Cleans broken symbolic links automatically

## Examples

### Scenario 1: Single Project Transcript Extraction

**Context:** You're researching a topic and need transcripts from several educational videos.

**Step 1:** Create `youtube.md` with video URLs

```bash
$ cat > youtube.md << EOF
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/jNQXAC9IVRw
https://www.youtube.com/watch?v=abc123xyz78
EOF
```

**Step 2:** Process transcripts

```bash
$ transcriptor
```

**Output:**

```
Processing youtube.md...
[✓] dQw4w9WgXcQ - fetched (1420ms) - 5.1KB
[✓] jNQXAC9IVRw - fetched (980ms) - 3.2KB
[✓] abc123xyz78 - fetched (1560ms) - 6.8KB
Complete: 3 processed, 0 errors, 0 cached
```

**Step 3:** Verify transcripts created

```bash
$ ls -lh transcripts/
total 24
lrwxr-xr-x  dQw4w9WgXcQ.md -> ~/.transcriptor/transcripts/dQw4w9WgXcQ.md
lrwxr-xr-x  jNQXAC9IVRw.md -> ~/.transcriptor/transcripts/jNQXAC9IVRw.md
lrwxr-xr-x  abc123xyz78.md -> ~/.transcriptor/transcripts/abc123xyz78.md
```

**Step 4:** Read transcript content

```bash
$ cat transcripts/dQw4w9WgXcQ.md
# [Transcript content appears here]
```

### Scenario 2: Reusing Transcripts Across Projects

**Context:** You have two projects that reference the same YouTube videos. Transcriptor's caching eliminates redundant API calls.

**Project A:**

```bash
$ cd ~/projects/research-project
$ cat > youtube.md << EOF
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/jNQXAC9IVRw
EOF
$ transcriptor
```

**Output:**

```
Processing youtube.md...
[✓] dQw4w9WgXcQ - fetched (1320ms) - 5.1KB
[✓] jNQXAC9IVRw - fetched (1100ms) - 3.2KB
Complete: 2 processed, 0 errors, 0 cached
```

**Project B (same videos):**

```bash
$ cd ~/projects/course-notes
$ cat > youtube.md << EOF
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/xyz789different
EOF
$ transcriptor
```

**Output:**

```
Processing youtube.md...
[✓] dQw4w9WgXcQ - cached (0ms)
[✓] xyz789different - fetched (1450ms) - 4.7KB
Complete: 2 processed, 0 errors, 1 cached
```

**Result:**

- **API calls saved:** 1 (dQw4w9WgXcQ reused from cache)
- **Storage saved:** 5.1KB (single copy, two symbolic links)
- **Time saved:** ~1300ms (instant retrieval vs. network fetch)

**Verify registry tracks both projects:**

```bash
$ cat ~/.transcriptor/data.json
```

```json
{
  "dQw4w9WgXcQ": {
    "date_added": "2024-11-19",
    "links": [
      "/Users/username/projects/research-project/transcripts",
      "/Users/username/projects/course-notes/transcripts"
    ]
  },
  "jNQXAC9IVRw": {
    "date_added": "2024-11-19",
    "links": ["/Users/username/projects/research-project/transcripts"]
  },
  "xyz789different": {
    "date_added": "2024-11-19",
    "links": ["/Users/username/projects/course-notes/transcripts"]
  }
}
```

### Scenario 3: Repository Maintenance

**Context:** After months of use, your transcript repository has grown. You want to understand storage usage and clean old transcripts.

**Step 1:** Check repository statistics

```bash
$ transcriptor data
```

**Output:**

```
Transcriptor Repository Statistics
===================================

Total Transcripts: 87
Storage Size: 34.6 MB
Date Range: 2024-01-15 to 2024-11-19

Oldest transcript: 2024-01-15
Newest transcript: 2024-11-19
```

**Step 2:** Decide on cleanup strategy
You determine that transcripts older than 6 months (before 2024-06-01) are no longer needed.

**Step 3:** Clean old transcripts

```bash
$ transcriptor clean 2024-06-01
```

**Output:**

```
Cleaning transcripts older than 2024-06-01...
[✓] dQw4w9WgXcQ - deleted (added 2024-01-15)
[✓] abc123xyz78 - deleted (added 2024-03-22)
[✓] def456uvw89 - deleted (added 2024-04-10)
... [continues for all old transcripts]
Complete: 45 transcripts removed, 42 remaining
```

**Step 4:** Verify cleanup

```bash
$ transcriptor data
```

**Output:**

```
Transcriptor Repository Statistics
===================================

Total Transcripts: 42
Storage Size: 18.2 MB
Date Range: 2024-06-01 to 2024-11-19

Oldest transcript: 2024-06-01
Newest transcript: 2024-11-19
```

**Result:**

- **Transcripts removed:** 45
- **Storage freed:** 16.4 MB (34.6 MB → 18.2 MB)
- **Symbolic links cleaned:** All links from deleted transcripts automatically removed

### Scenario 4: Error Recovery and Partial Processing

**Context:** You're processing a large batch of URLs, but the command is interrupted (Ctrl+C, system crash, network failure).

**Step 1:** Create large `youtube.md` file

```bash
$ cat youtube.md
https://www.youtube.com/watch?v=video001
https://www.youtube.com/watch?v=video002
https://www.youtube.com/watch?v=video003
... [50 more URLs]
```

**Step 2:** Start processing (interrupted after 15 videos)

```bash
$ transcriptor
```

**Output:**

```
Processing youtube.md...
[✓] video001 - fetched (1200ms) - 4.5KB
[✓] video002 - fetched (1350ms) - 5.2KB
... [13 more successful]
^C [User interrupts with Ctrl+C]
```

**Step 3:** Check what was saved

```bash
$ ls transcripts/ | wc -l
15
```

**Result:** First 15 transcripts were saved (crash-resilient persistence).

**Step 4:** Resume processing

```bash
$ transcriptor
```

**Output:**

```
Processing youtube.md...
[✓] video001 - cached (0ms)
[✓] video002 - cached (0ms)
... [13 more cached]
[✓] video016 - fetched (1100ms) - 3.8KB
[✓] video017 - fetched (1450ms) - 6.1KB
... [continues from where it stopped]
Complete: 53 processed, 0 errors, 15 cached
```

**Notes:**

- Previously fetched transcripts are cached (immediate)
- Processing continues from first unfetched video
- No duplicate API calls or storage

### Scenario 5: Cross-Platform Usage

**macOS/Linux:**

```bash
$ transcriptor
$ ls -la transcripts/
lrwxr-xr-x  dQw4w9WgXcQ.md -> /Users/username/.transcriptor/transcripts/dQw4w9WgXcQ.md
```

**Windows (with developer mode or admin privileges):**

```powershell
PS> transcriptor
PS> Get-Item transcripts\dQw4w9WgXcQ.md | Select-Object LinkType, Target

LinkType     Target
--------     ------
SymbolicLink C:\Users\username\.transcriptor\transcripts\dQw4w9WgXcQ.md
```

**WSL (Windows Subsystem for Linux):**

```bash
$ transcriptor
$ readlink transcripts/dQw4w9WgXcQ.md
/home/username/.transcriptor/transcripts/dQw4w9WgXcQ.md
```

## Troubleshooting

### Configuration Problems

**Problem: Command not found after installation**

```bash
$ transcriptor
-bash: transcriptor: command not found
```

**Solutions:**

1. Verify global installation:
   ```bash
   npm list -g nodejs-youtube-transcriptor
   ```
2. Check npm global bin path is in PATH:
   ```bash
   npm config get prefix
   # Add <prefix>/bin to your PATH environment variable
   ```
3. Reinstall globally:
   ```bash
   npm install -g nodejs-youtube-transcriptor
   ```

---

**Problem: Missing API key error**

```bash
$ transcriptor
Error: SCRAPE_CREATORS_API_KEY environment variable is required
```

**Solutions:**

1. Verify `.env` file exists in current directory:
   ```bash
   ls -la .env
   ```
2. Check `.env` file contains the correct variable name:
   ```bash
   cat .env
   # Should show: SCRAPE_CREATORS_API_KEY=your_key_here
   ```
3. Ensure no extra whitespace or quotes:

   ```env
   # Incorrect:
   SCRAPE_CREATORS_API_KEY = "your_key_here"

   # Correct:
   SCRAPE_CREATORS_API_KEY=your_key_here
   ```

---

**Problem: API authentication failed (401)**

```bash
[✗] dQw4w9WgXcQ - API Error: Authentication failed (401)
```

**Solutions:**

1. Verify API key is correct:
   - Log in to [Scrape Creators dashboard](https://api.scrapecreators.com)
   - Regenerate API key if necessary
2. Check for extra whitespace in `.env` file:
   ```bash
   # Use: SCRAPE_CREATORS_API_KEY=sk_live_abc123
   # Not: SCRAPE_CREATORS_API_KEY= sk_live_abc123
   ```
3. Ensure key has not expired or been revoked

### File System Issues

**Problem: youtube.md file not found**

```bash
$ transcriptor
Error: youtube.md file not found in current directory
```

**Solutions:**

1. Verify you're in the correct directory:
   ```bash
   pwd
   ls youtube.md
   ```
2. Create `youtube.md` file:
   ```bash
   touch youtube.md
   # Add YouTube URLs (one per line)
   ```
3. Check filename is exactly `youtube.md` (case-sensitive on Linux/macOS)

---

**Problem: Permission denied on ~/.transcriptor**

```bash
Error: EACCES: permission denied, mkdir '/Users/username/.transcriptor'
```

**Solutions:**

1. Check home directory permissions:
   ```bash
   ls -ld ~
   # Should show: drwxr-xr-x
   ```
2. Fix permissions if necessary:
   ```bash
   chmod 755 ~
   ```
3. Manually create directory with correct permissions:
   ```bash
   mkdir -p ~/.transcriptor/transcripts
   chmod 755 ~/.transcriptor
   ```

---

**Problem: Symbolic link creation fails on Windows**

```powershell
Error: EPERM: operation not permitted, symlink
```

**Solutions:**

1. **Enable Developer Mode:**
   - Open Settings → Update & Security → For developers
   - Enable "Developer Mode"
   - Restart terminal
2. **Run as Administrator:**
   - Right-click PowerShell/Command Prompt
   - Select "Run as administrator"
3. **Use WSL (recommended):**
   - Install Windows Subsystem for Linux
   - Run `transcriptor` within WSL environment

### API Integration Issues

**Problem: API rate limited (429 error)**

```bash
[✗] dQw4w9WgXcQ - API Error: Rate limit exceeded (429)
```

**Explanation:**
Scrape Creators API has rate limits (typically 100 requests/minute). Transcriptor automatically retries with exponential backoff.

**Solutions:**

1. Wait for backoff to complete (automatic):
   - 1st retry: 1 second delay
   - 2nd retry: 2 seconds delay
   - 3rd retry: 4 seconds delay
2. Process smaller batches:
   - Split `youtube.md` into smaller files
   - Process sequentially with delays
3. Upgrade API plan for higher rate limits

---

**Problem: Transcript fetch timeout**

```bash
[✗] dQw4w9WgXcQ - Fetch timeout after 30000ms
```

**Causes:**

- Very long video transcript
- Slow network connection
- API service temporarily slow

**Solutions:**

1. Re-run `transcriptor` (will retry failed URLs):
   ```bash
   transcriptor
   ```
2. Check network connection:
   ```bash
   ping api.scrapecreators.com
   ```
3. Try individual URLs to isolate issue

---

**Problem: Invalid video ID / Video not available**

```bash
[✗] invalid123 - API Error: Video not found or transcript unavailable (400)
```

**Causes:**

- Video has no transcript/captions
- Video is private or deleted
- Invalid video ID in URL

**Solutions:**

1. Verify video has captions:
   - Open video on YouTube
   - Check for CC (closed captions) button
2. Check video is publicly accessible
3. Remove invalid URLs from `youtube.md`

### Data Integrity Issues

**Problem: Registry entries for missing transcripts**

```bash
Warning: Orphaned registry entry detected: dQw4w9WgXcQ
```

**Explanation:**
Registry references a transcript file that doesn't exist (manually deleted or corrupted).

**Solutions:**

1. **Automatic cleanup:** Run `transcriptor` (validates and cleans automatically):
   ```bash
   transcriptor
   ```
2. **Manual cleanup:** Use clean command:
   ```bash
   transcriptor clean 1970-01-01
   # Removes entries without files
   ```

---

**Problem: Broken symbolic links in ./transcripts/**

```bash
$ ls -la transcripts/
lrwxr-xr-x  dQw4w9WgXcQ.md -> ~/.transcriptor/transcripts/dQw4w9WgXcQ.md (broken)
```

**Causes:**

- Central transcript file was deleted
- Registry entry removed but link persists

**Solutions:**

1. Re-run `transcriptor` to recreate missing transcripts:
   ```bash
   transcriptor
   ```
2. Manually remove broken links:
   ```bash
   find transcripts/ -type l ! -exec test -e {} \; -delete
   ```
3. Clean and rebuild:
   ```bash
   rm -rf transcripts/
   transcriptor
   ```

### Performance Issues

**Problem: Large registry loading slowly**

**Context:** Thousands of transcripts causing slow startup.

**Solutions:**

1. Clean old/unused transcripts:
   ```bash
   transcriptor clean YYYY-MM-DD
   ```
2. Archive registry periodically:
   ```bash
   cp ~/.transcriptor/data.json ~/.transcriptor/data.json.backup
   ```

---

**Problem: Disk space warnings**

**Check storage usage:**

```bash
transcriptor data
# Shows total storage size

du -sh ~/.transcriptor
# Shows actual disk usage
```

**Solutions:**

1. Clean old transcripts:
   ```bash
   transcriptor clean 2024-06-01
   ```
2. Manually remove unused transcripts:
   ```bash
   rm ~/.transcriptor/transcripts/[video-id].md
   # Then run transcriptor to clean registry
   ```

### Still Having Issues?

If you encounter issues not covered here:

1. **Check GitHub issues:** [https://github.com/michaellinhardt/nodejs-youtube-transcriptor/issues](https://github.com/michaellinhardt/nodejs-youtube-transcriptor/issues)
2. **Report new issue:** Include:
   - Operating system and version
   - Node.js version (`node --version`)
   - npm version (`npm --version`)
   - Exact command executed
   - Complete error message
   - Content of `youtube.md` (if relevant)

## Contributing

Contributions are welcome! Here's how to get involved:

### Reporting Issues

Found a bug or have a feature request? Please [open an issue](https://github.com/michaellinhardt/nodejs-youtube-transcriptor/issues) on GitHub.

**Bug Report Template:**

```markdown
**Describe the bug:**
A clear description of what the bug is.

**To Reproduce:**
Steps to reproduce the behavior:

1. Create youtube.md with URL '...'
2. Run command '...'
3. See error

**Expected behavior:**
What you expected to happen.

**Environment:**

- OS: [e.g., macOS 14.0, Ubuntu 22.04, Windows 11]
- Node.js version: [e.g., 18.17.0]
- npm version: [e.g., 9.6.7]

**Additional context:**
Error messages, screenshots, relevant logs.
```

**Feature Request Template:**

```markdown
**Feature description:**
Clear description of the proposed feature.

**Use case:**
Explain the problem this feature solves.

**Proposed solution:**
How you envision this working.

**Alternatives considered:**
Other approaches you've thought about.
```

### Development Setup

**Step 1: Clone repository**

```bash
git clone https://github.com/michaellinhardt/nodejs-youtube-transcriptor.git
cd nodejs-youtube-transcriptor
```

**Step 2: Install dependencies**

```bash
npm install
```

**Step 3: Link for local testing**

```bash
npm link
```

**Step 4: Test your changes**

```bash
transcriptor help
transcriptor data
# Create test youtube.md and run transcriptor
```

**Step 5: Run linters**

```bash
npm run lint    # ESLint
npm run format  # Prettier
```

### Code Guidelines

- **ESLint:** Code is linted with ESLint (run `npm run lint`)
- **Prettier:** Code is formatted with Prettier (run `npm run format`)
- **No automated tests:** This project does not include unit/integration tests by design (small scope, simple functionality)
- **Documentation:** Update README.md for user-facing changes
- **Comments:** Add JSDoc comments for public functions
- **Error handling:** Gracefully handle errors (continue processing, log errors)

### Pull Request Process

1. **Fork** the repository
2. **Create branch** for your feature: `git checkout -b feature/my-feature`
3. **Make changes** following code guidelines
4. **Lint and format** code: `npm run lint && npm run format`
5. **Commit changes** with clear commit messages
6. **Push to fork:** `git push origin feature/my-feature`
7. **Open Pull Request** with description of changes

### Project Structure

```
nodejs-youtube-transcriptor/
├── bin/
│   └── transcriptor          # CLI entry point
├── src/
│   ├── index.js              # Command router
│   ├── commands/             # Command handlers (process, help, data, clean)
│   ├── services/             # Business logic (TranscriptService, StorageService, APIClient)
│   └── utils/                # Shared utilities (PathResolver, validators)
├── docs/                     # Project documentation (functional/technical specs)
├── dev/                      # Development files (tasks, plans)
├── .env.example              # Environment variable template
├── package.json              # npm configuration
└── README.md                 # User documentation (this file)
```

**Key Modules:**

- **CommandHandler** (`src/commands/`): CLI command implementations
- **TranscriptService** (`src/services/TranscriptService.js`): Orchestrates transcript processing workflow
- **StorageService** (`src/services/StorageService.js`): Manages registry and file operations
- **APIClient** (`src/services/APIClient.js`): Handles API requests with retry logic
- **PathResolver** (`src/utils/PathResolver.js`): Cross-platform path resolution

## License

This project is licensed under the **MIT License**.

**What this means:**

- ✅ Commercial use permitted
- ✅ Modification permitted
- ✅ Distribution permitted
- ✅ Private use permitted
- ℹ️ License and copyright notice required

See the [LICENSE](./LICENSE) file for full details.

---

**Author:** [michaellinhardt](https://github.com/michaellinhardt)

**Repository:** [https://github.com/michaellinhardt/nodejs-youtube-transcriptor](https://github.com/michaellinhardt/nodejs-youtube-transcriptor)

**Issues:** [https://github.com/michaellinhardt/nodejs-youtube-transcriptor/issues](https://github.com/michaellinhardt/nodejs-youtube-transcriptor/issues)

---

**Made with ❤️ for efficient transcript management across projects.**
