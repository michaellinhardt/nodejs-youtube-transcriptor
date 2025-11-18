# Contributing Guide

## Welcome

Thank you for your interest in contributing to Transcriptor! This guide provides clear standards for code quality, commit conventions, and development workflows to ensure consistent and high-quality contributions.

We welcome contributions in the form of:
- Bug fixes and issue resolutions
- Feature enhancements and new functionality
- Documentation improvements
- Code refactoring and optimization

All contributions should follow the guidelines outlined in this document to maintain codebase consistency and quality.

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18 or higher
- **npm**: Comes with Node.js (version 9+)
- **Git**: For version control
- **Text Editor**: VS Code, Sublime Text, or your preferred editor

### Initial Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/nodejs-youtube-transcriptor.git
   cd nodejs-youtube-transcriptor
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   ```bash
   # Copy the example environment file
   cp .env.example .env

   # Edit .env and add your API key
   # SCRAPE_CREATORS_API_KEY=your_actual_api_key_here
   ```

4. **Obtain API Key**:
   - Sign up for Scrape Creators API service
   - Generate an API key
   - Add the key to your `.env` file

5. **Link Package Globally** (for local testing):
   ```bash
   npm link
   ```

6. **Verify Installation**:
   ```bash
   # Display help
   transcriptor help

   # Check version
   transcriptor --version
   ```

7. **Test Existing Functionality**:
   ```bash
   # Create a test file
   echo "https://www.youtube.com/watch?v=dQw4w9WgXcQ" > youtube.md

   # Run transcriptor
   transcriptor

   # Verify transcript was created
   ls transcripts/
   ```

If all commands execute successfully, your development environment is ready.

### Project Structure Overview

```
nodejs-youtube-transcriptor/
├── bin/
│   └── transcriptor          # CLI executable entry point
├── src/
│   ├── index.js              # Command router
│   ├── commands/             # Command handler implementations
│   │   ├── process.js
│   │   ├── help.js
│   │   ├── data.js
│   │   └── clean.js
│   ├── services/             # Business logic services
│   │   ├── TranscriptService.js
│   │   ├── StorageService.js
│   │   ├── APIClient.js
│   │   ├── LinkManager.js
│   │   └── MaintenanceService.js
│   ├── utils/                # Shared utilities
│   │   ├── pathResolver.js
│   │   ├── validators.js
│   │   ├── URLParser.js
│   │   ├── ConsoleFormatter.js
│   │   └── ...
│   └── constants/            # Configuration constants
│       └── APIClientConstants.js
├── docs/                     # Documentation
│   ├── project_overview.md
│   ├── requirements_functional.md
│   ├── requirements_technical.md
│   ├── API_INTEGRATION.md
│   ├── ARCHITECTURE.md
│   ├── DATA_FLOW.md
│   └── CONTRIBUTING.md (this file)
├── dev/                      # Development planning
│   ├── tasks.md
│   └── plans/
├── .env.example              # Environment template
├── .gitignore
├── package.json
└── README.md
```

## Code Style Guidelines

### JavaScript Syntax and Formatting

The project follows modern JavaScript (ES6+) standards with specific formatting rules:

**Indentation**: 2 spaces (enforced by Prettier)
```javascript
// Correct
function example() {
  if (condition) {
    doSomething();
  }
}

// Incorrect
function example() {
    if (condition) {
        doSomething();
    }
}
```

**Line Length**: Aim for 100 characters maximum (soft limit)

**Semicolons**: Required at end of statements
```javascript
// Correct
const value = 42;
doSomething();

// Incorrect
const value = 42
doSomething()
```

**Quotes**: Single quotes for strings, except when avoiding escaping
```javascript
// Correct
const message = 'Hello world';
const withQuote = "It's a beautiful day";

// Incorrect
const message = "Hello world";
```

### Variable Naming Conventions

**camelCase for Variables and Functions**:
```javascript
const videoId = 'dQw4w9WgXcQ';
const transcriptContent = 'Sample text...';

function fetchTranscript(url) {
  // ...
}

async function processVideo(videoId) {
  // ...
}
```

**UPPER_CASE for Constants**:
```javascript
const MAX_RETRIES = 3;
const API_TIMEOUT = 30000;
const ALLOWED_ENTRY_KEYS = ['date_added', 'links'];
```

**Descriptive Names** (avoid abbreviations unless common):
```javascript
// Good
const transcriptService = new TranscriptService();
const registryPath = pathResolver.getRegistryPath();

// Avoid
const ts = new TranscriptService();
const rp = pathResolver.getRegistryPath();
```

**Loop Counters Exception**: Single letters acceptable for simple loops
```javascript
for (let i = 0; i < array.length; i++) {
  // ...
}
```

### Comments and Documentation

**When to Comment**:
- Complex algorithms or non-obvious logic
- Business rule implementations
- "Why" explanations (not "what")
- Public API methods (JSDoc format)

**JSDoc for Public Methods**:
```javascript
/**
 * Fetch transcript for YouTube video
 * @param {string} videoUrl - Full YouTube URL
 * @returns {Promise<string>} Plain text transcript
 * @throws {Error} On authentication failure (401)
 */
async fetchTranscript(videoUrl) {
  // Implementation
}
```

**Inline Comments for Complex Logic**:
```javascript
// Use exponential backoff for retries (1s, 2s, 4s)
// with ±25% jitter to prevent thundering herd
const delay = Math.pow(2, attempt - 1) * 1000;
const jitter = delay * 0.25 * (Math.random() * 2 - 1);
const actualDelay = Math.max(0, delay + jitter);
```

**Avoid Obvious Comments**:
```javascript
// Bad - comment states the obvious
// Increment counter
counter++;

// Good - no comment needed, code is self-explanatory
counter++;
```

**Keep Comments Current**: Update comments when code changes

### File Organization

**One Class Per File** (typically):
```javascript
// StorageService.js
class StorageService {
  // ...
}

module.exports = StorageService;
```

**Imports at Top**:
```javascript
// External dependencies first
const fs = require('fs-extra');
const path = require('path');

// Internal dependencies second
const StorageService = require('./services/StorageService');
const validators = require('./utils/validators');
```

**Exports at Bottom**:
```javascript
class MyClass {
  // Implementation
}

module.exports = MyClass;
```

### Error Handling Best Practices

**Always Handle Errors** (never ignore):
```javascript
// Good
try {
  await riskyOperation();
} catch (error) {
  console.error(`Operation failed: ${error.message}`);
  // Handle appropriately
}

// Bad
try {
  await riskyOperation();
} catch (error) {
  // Empty catch - never do this
}
```

**Use Guard Clauses** to reduce nesting:
```javascript
// Good
async function processVideo(videoId) {
  if (!videoId) {
    throw new Error('Video ID required');
  }

  if (!this.initialized) {
    throw new Error('Service not initialized');
  }

  // Main logic here
  return await fetchTranscript(videoId);
}

// Avoid deep nesting
async function processVideo(videoId) {
  if (videoId) {
    if (this.initialized) {
      return await fetchTranscript(videoId);
    } else {
      throw new Error('Service not initialized');
    }
  } else {
    throw new Error('Video ID required');
  }
}
```

**Provide Meaningful Error Messages**:
```javascript
// Good
throw new Error('Transcript exceeds 10MB limit: 12.5MB');

// Bad
throw new Error('Invalid size');
```

### Formatting and Linting

**Before Committing**:

1. **Format Code with Prettier**:
   ```bash
   npm run format
   ```

2. **Lint Code with ESLint**:
   ```bash
   npm run lint
   ```

3. **Fix Auto-fixable Issues**:
   ```bash
   npm run lint -- --fix
   ```

## Commit Conventions

### Commit Message Format

All commits should follow this structure:

```
[TASK-X.X] Brief imperative description

Optional longer explanation of changes made,
rationale for approach, and related requirements.

References: FR-X, TR-X
```

**Components**:
- **Task Reference**: `[TASK-X.X]` format (e.g., `[TASK-5.1]`)
- **Subject Line**: Brief description in imperative mood
- **Body** (optional): Detailed explanation if needed
- **References** (optional): Related functional/technical requirements

### Commit Message Guidelines

**Subject Line**:
- Keep under 50 characters
- Use imperative mood: "Add", "Fix", "Implement", "Update" (not "Added", "Fixed")
- No period at the end
- Capitalize first word

**Examples**:

```bash
# Good
[TASK-5.1] Add URL parsing with YouTube ID extraction
[TASK-4.1] Implement API client with error handling and retries
[TASK-3.2] Fix atomic write race condition in registry
[TASK-9.2] Update API integration documentation

# Bad
[TASK-5.1] added url parsing  # Not imperative, not capitalized
[task-4.1] API client implementation.  # Wrong format, has period
Fixed bug  # Missing task reference
```

**Longer Commit Message Example**:

```
[TASK-4.1] Implement exponential backoff for rate limiting

Add retry logic to APIClient that uses exponential backoff
when 429 (rate limited) errors occur. Retry delays are 1s,
2s, and 4s with ±25% jitter to prevent thundering herd.

Maximum 3 total attempts (1 initial + 2 retries) before
giving up and skipping the URL.

References: FR-10.1, TR-12
```

### One Logical Change Per Commit

Each commit should represent a single, complete, logical change:

**Good** (focused commits):
```
[TASK-3.2] Add atomic write for registry persistence
[TASK-3.2] Add registry validation on load
[TASK-3.2] Add error recovery for corrupted registry
```

**Bad** (mixed changes):
```
[TASK-3.2] Add atomic writes and fix URL parsing and update docs
```

### Referencing Issues and Requirements

When applicable, reference:
- Task numbers from `/dev/tasks.md`
- Functional requirements (FR-X)
- Technical requirements (TR-X)
- GitHub issue numbers (if using issues)

## Branch Naming

### Branch Naming Convention

**Format**: `{type}/{task-number}-{brief-description}`

**Types**:
- `feature/` - New features or enhancements
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring (no behavior change)
- `chore/` - Maintenance tasks (dependencies, config)

**Examples**:

```bash
# Feature branches
feature/task-5-1-url-parsing
feature/task-4-1-api-client-retry-logic
feature/task-6-3-data-statistics

# Bug fix branches
fix/task-4-1-null-response-handling
fix/registry-corruption-recovery

# Documentation branches
docs/task-9-2-contributing-guide
docs/api-integration-examples

# Refactor branches
refactor/task-4-1-extract-error-handler
refactor/simplify-cache-check-logic
```

### Branch Workflow

1. **Always Branch from Main**:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/task-5-1-url-parsing
   ```

2. **Keep Branches Focused**: One task/feature per branch

3. **Delete After Merge**: Clean up merged branches
   ```bash
   git branch -d feature/task-5-1-url-parsing
   ```

## Pull Request Process

### Creating a Pull Request

1. **Ensure Branch is Up-to-Date**:
   ```bash
   git checkout main
   git pull origin main
   git checkout feature/task-5-1-url-parsing
   git rebase main
   ```

2. **Format and Lint**:
   ```bash
   npm run format
   npm run lint
   ```

3. **Push Branch**:
   ```bash
   git push origin feature/task-5-1-url-parsing
   ```

4. **Create PR with Descriptive Information**

### Pull Request Template

Use this template structure for your PR description:

```markdown
## Task
[TASK-X.X] Feature or Fix Name

## Changes
- Change 1: Brief description
- Change 2: Brief description
- Change 3: Brief description

## Related Requirements
- FR-X: [Brief requirement description]
- TR-X: [Brief requirement description]

## Testing
Tested on: macOS / Windows / Linux

### Test Cases Verified
- [ ] Happy path: Normal operation works correctly
- [ ] Error handling: Invalid inputs handled gracefully
- [ ] Edge cases: Boundary conditions tested
- [ ] Integration: Works with existing features

### API Integration Tests (if applicable)
- [ ] Valid API key works
- [ ] Invalid API key shows clear error
- [ ] Invalid URLs skip gracefully
- [ ] Rate limiting retry works

## Checklist
- [ ] Code follows style guidelines
- [ ] tasks.md updated (checked off completed subtasks)
- [ ] Documentation updated (if user-facing changes)
- [ ] No breaking changes (or documented if necessary)
- [ ] Ran `npm run format` and `npm run lint`
- [ ] Tested manually on local environment
```

### Pull Request Review Process

1. **Create PR**: Submit with complete description
2. **Wait for Review**: Maintainer will review code
3. **Address Feedback**: Make requested changes if any
4. **Update PR**: Push updates to same branch
5. **Approval**: Maintainer approves when ready
6. **Merge**: Maintainer merges to main branch

### Pull Request Best Practices

- Keep PRs focused (one task/feature)
- Write clear descriptions
- Include screenshots/logs if helpful
- Respond to feedback promptly
- Keep commits clean (squash if needed)

## Manual Testing

### Testing Approach

**Note**: This project does not include automated tests per project policy. All verification is done through manual testing.

### General Testing Checklist

For any feature or fix, verify:

- [ ] **Happy Path**: Normal operation works as expected
- [ ] **Error Cases**: Invalid inputs handled gracefully
- [ ] **Edge Cases**: Boundary conditions (empty input, very large input, special characters)
- [ ] **Cross-Platform** (if possible): Test on macOS, Windows, Linux
- [ ] **Integration**: Feature works with existing functionality

### Main Command Testing Checklist

Testing `transcriptor` (process command):

- [ ] **Single Valid URL**:
  ```bash
  echo "https://www.youtube.com/watch?v=dQw4w9WgXcQ" > youtube.md
  transcriptor
  # Verify: Transcript in ~/.transcriptor/transcripts/
  # Verify: Link in ./transcripts/
  # Verify: Entry in ~/.transcriptor/data.json
  ```

- [ ] **Multiple URLs**:
  ```bash
  cat > youtube.md <<EOF
  https://www.youtube.com/watch?v=dQw4w9WgXcQ
  https://youtu.be/jNQXAC9IVRw
  https://www.youtube.com/watch?v=9bZkp7q19f0
  EOF
  transcriptor
  # Verify: All transcripts created
  # Verify: All links created
  ```

- [ ] **Cache Hit** (process same URL twice):
  ```bash
  echo "https://www.youtube.com/watch?v=dQw4w9WgXcQ" > youtube.md
  transcriptor
  # First run - should fetch from API

  transcriptor
  # Second run - should use cache
  # Verify: "Cache hit" in output
  ```

- [ ] **Invalid URL**:
  ```bash
  echo "https://www.invalid.com/video" > youtube.md
  transcriptor
  # Verify: Skips gracefully, doesn't crash
  ```

- [ ] **Missing youtube.md**:
  ```bash
  rm youtube.md
  transcriptor
  # Verify: Shows help message
  ```

### API Integration Testing Checklist

- [ ] **Valid API Key**:
  ```bash
  # .env has correct key
  transcriptor
  # Verify: API calls succeed
  ```

- [ ] **Invalid API Key**:
  ```bash
  # .env has wrong key
  transcriptor
  # Verify: Clear error message about API key
  # Verify: Process exits (doesn't continue)
  ```

- [ ] **Invalid Video URL**:
  ```bash
  echo "https://www.youtube.com/watch?v=invalid123" > youtube.md
  transcriptor
  # Verify: Skips URL, logs 400 error
  # Verify: Continues with remaining URLs
  ```

- [ ] **Rate Limiting** (if testable):
  ```bash
  # Process 100+ videos quickly
  transcriptor
  # Verify: Retry logic activates on 429
  # Verify: Exponential backoff delays visible
  ```

### Data Command Testing Checklist

Testing `transcriptor data`:

- [ ] **With Transcripts**:
  ```bash
  transcriptor data
  # Verify: Shows total count
  # Verify: Shows storage size (MB)
  # Verify: Shows oldest/newest dates
  ```

- [ ] **Empty Storage**:
  ```bash
  rm -rf ~/.transcriptor
  transcriptor data
  # Verify: Shows 0 transcripts, handles gracefully
  ```

### Clean Command Testing Checklist

Testing `transcriptor clean YYYY-MM-DD`:

- [ ] **Valid Date**:
  ```bash
  transcriptor clean 2025-11-01
  # Verify: Old transcripts deleted
  # Verify: Files removed from ~/.transcriptor/transcripts/
  # Verify: Links removed from projects
  # Verify: Registry updated
  ```

- [ ] **Invalid Date**:
  ```bash
  transcriptor clean not-a-date
  # Verify: Clear error message about format
  ```

- [ ] **Boundary Behavior** (exclusive):
  ```bash
  # Video added on 2025-11-15
  transcriptor clean 2025-11-15
  # Verify: Video from 2025-11-15 NOT deleted
  # Verify: Videos before 2025-11-15 deleted
  ```

### Cross-Platform Testing

If you have access to multiple operating systems:

**macOS**:
- [ ] Verify symbolic links work
- [ ] Check path resolution (~/.transcriptor)

**Windows**:
- [ ] Verify symbolic links work (may need admin privileges)
- [ ] Check path resolution (%USERPROFILE%\.transcriptor)

**Linux**:
- [ ] Verify symbolic links work
- [ ] Check path resolution (~/.transcriptor)

## Documentation Updates

### When to Update Documentation

Update documentation when:
- Adding new features or commands
- Changing user-facing behavior
- Modifying API integration details
- Changing system architecture
- Fixing bugs that affect documented behavior

### Files to Update

**Task Tracking** (`/dev/tasks.md`):
- Check off completed subtasks: `- [x] 1.1.1 Task description`
- Add new subtasks if discovered during implementation
- Maintain hierarchical structure (task → subtask → sub-subtask)

**User Documentation** (`README.md`):
- Update if commands change
- Add new features to feature list
- Update usage examples
- Modify installation instructions if needed

**Developer Documentation** (`docs/`):
- **API_INTEGRATION.md**: Update if API integration changes
- **ARCHITECTURE.md**: Update if module structure changes
- **DATA_FLOW.md**: Update if processing workflow changes
- **CONTRIBUTING.md**: Update if development process changes

**Code Documentation**:
- Add inline comments for complex logic
- Update JSDoc for changed method signatures
- Document non-obvious design decisions

### Documentation Quality Standards

- **Clear**: Easy to understand for target audience
- **Accurate**: Reflects current implementation
- **Complete**: Covers all aspects of feature
- **Examples**: Include practical code/command examples
- **Up-to-date**: Update when code changes

## Common Workflows

### Bug Fix Workflow

1. **Identify Bug**:
   - Reproduce the issue locally
   - Document steps to reproduce

2. **Create Branch**:
   ```bash
   git checkout -b fix/issue-description
   ```

3. **Fix Issue**:
   - Make minimal changes to fix bug
   - Don't add unrelated changes

4. **Test Fix**:
   - Verify bug is resolved
   - Test related functionality still works
   - Test edge cases

5. **Commit Changes**:
   ```bash
   git add <files>
   git commit -m "[TASK-X.X] Fix: description of bug fix"
   ```

6. **Create PR**:
   - Include bug description
   - Explain fix approach
   - Show before/after behavior

7. **Merge**:
   - Wait for review
   - Merge after approval

### Feature Development Workflow

1. **Review Requirements**:
   - Read task description in `/dev/tasks.md`
   - Review related FR (functional requirements)
   - Review related TR (technical requirements)

2. **Create Branch**:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/task-X-X-description
   ```

3. **Implement Feature**:
   - Follow code style guidelines
   - Implement incrementally
   - Test as you go

4. **Commit Frequently**:
   ```bash
   # Make logical commits
   git add <files>
   git commit -m "[TASK-X.X] Brief description"
   ```

5. **Format and Lint**:
   ```bash
   npm run format
   npm run lint
   ```

6. **Manual Testing**:
   - Follow testing checklist
   - Test happy path
   - Test error scenarios
   - Test edge cases

7. **Update Documentation**:
   - Update `/dev/tasks.md` (check off subtasks)
   - Update relevant docs files
   - Add inline code comments

8. **Create PR**:
   - Use PR template
   - Include task reference
   - List all changes
   - Document testing performed

9. **Review and Merge**:
   - Address review feedback
   - Update PR as needed
   - Merge after approval

### Documentation Update Workflow

1. **Identify Changes**:
   - What documentation needs updating?
   - Which files are affected?

2. **Create Branch**:
   ```bash
   git checkout -b docs/description-of-update
   ```

3. **Update Files**:
   - Edit markdown files
   - Verify syntax (especially for code blocks, lists)
   - Check links are accurate

4. **Keep Examples Current**:
   - Ensure code examples match implementation
   - Update file paths if changed
   - Verify commands work as documented

5. **Commit**:
   ```bash
   git add docs/
   git commit -m "[DOCS] Description of documentation update"
   ```

6. **Create PR**:
   - Note which docs were updated
   - Explain why updates were needed

## Getting Help

### Before Asking for Help

1. **Review Existing Documentation**:
   - Check `README.md`
   - Review relevant docs in `/docs`
   - Read requirements in `/docs/requirements_*.md`

2. **Search for Similar Issues**:
   - Check GitHub issues (if applicable)
   - Search closed issues for solutions

3. **Check Code References**:
   - Read inline comments
   - Review related code files

### When Asking for Help

**Provide Context**:
- What were you trying to do?
- What did you expect to happen?
- What actually happened?

**Include Information**:
- Error messages (full stack trace)
- Relevant code snippets
- Steps to reproduce
- Environment details (OS, Node version)

**Reference Relevant Files**:
- Link to specific code files
- Reference requirement numbers (FR-X, TR-X)
- Quote relevant documentation

**Example Good Help Request**:

```
I'm implementing task 5.1 (URL parsing) and getting an error when
processing YouTube short URLs (youtu.be format).

Error:
  TypeError: Cannot read property 'match' of null
  at extractVideoId (TranscriptService.js:45)

Expected:
  Video ID "jNQXAC9IVRw" extracted from "https://youtu.be/jNQXAC9IVRw"

Actual:
  null returned, causing downstream error

Code reference:
  src/services/TranscriptService.js line 45
  Regex pattern from src/utils/YouTubeConstants.js

Environment:
  macOS Sonoma 14.5
  Node.js v18.17.0

I've verified the regex works in isolation (tested in regex101.com).
Any ideas what might be causing this?
```

## Style and Quality Reminders

### Quick Reference

**Before Every Commit**:
- [ ] Format code: `npm run format`
- [ ] Lint code: `npm run lint`
- [ ] Test manually
- [ ] Update `/dev/tasks.md`
- [ ] Update docs if needed

**Code Quality**:
- Descriptive variable names
- Guard clauses to reduce nesting
- Meaningful error messages
- JSDoc for public methods
- Comments for complex logic

**Commit Quality**:
- One logical change per commit
- Imperative subject line
- Reference task number
- Keep subject under 50 chars

**PR Quality**:
- Clear description
- List all changes
- Document testing
- Reference requirements

## Additional Resources

### Project Documentation

- **Project Overview**: `docs/project_overview.md`
- **Functional Requirements**: `docs/requirements_functional.md`
- **Technical Requirements**: `docs/requirements_technical.md`
- **API Integration**: `docs/API_INTEGRATION.md`
- **Architecture**: `docs/ARCHITECTURE.md`
- **Data Flow**: `docs/DATA_FLOW.md`

### External Resources

- **Node.js Documentation**: https://nodejs.org/docs/
- **npm Documentation**: https://docs.npmjs.com/
- **Commander.js**: https://github.com/tj/commander.js
- **Axios**: https://axios-http.com/docs/intro
- **ESLint**: https://eslint.org/docs/latest/
- **Prettier**: https://prettier.io/docs/en/

## Questions or Suggestions?

If you have questions about contributing or suggestions for improving this guide:

1. Open an issue with the "documentation" label
2. Create a PR with proposed changes to this file
3. Discuss in PR comments on related pull requests

Thank you for contributing to Transcriptor!
