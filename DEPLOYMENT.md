# Deployment & Performance Guide

## Installation

### Automated Installation (Recommended)

```bash
npm run install:global
```

This will:
- Validate Node.js version (>=18.0.0)
- Check write permissions
- Create global `transcriptor` command via npm link
- Display post-installation instructions

### Manual Installation

```bash
npm link
```

### Post-Installation Verification

```bash
transcriptor --version
```

## Uninstallation

### Automated Uninstallation (Recommended)

```bash
npm run uninstall:global
```

This will:
- Remove global `transcriptor` command
- Prompt for data retention decision
- Clean up ~/.transcriptor if requested
- Display confirmation

### Manual Uninstallation

```bash
npm unlink -g nodejs-youtube-transcriptor
```

To remove data:
```bash
rm -rf ~/.transcriptor
```

## Verbosity Control

### Quiet Mode

Suppress all output except errors (useful for automation):

```bash
transcriptor --quiet
transcriptor data --quiet
```

### Verbose Mode

Show detailed operation logs including:
- Cache hit/miss statistics
- API request/response details
- File system operations
- Performance timing
- Memory usage

```bash
transcriptor --verbose
transcriptor clean 2025-01-01 --verbose
```

### Default Mode

Normal operational output (no flags required):

```bash
transcriptor
transcriptor data
```

## Performance Optimization

### Registry Caching

The system automatically caches registry metadata to optimize operations:

- **Metadata-only loading**: Statistics calculated without loading full registry
- **LRU eviction**: Cache limited to 1000 entries to prevent memory issues
- **Atomic invalidation**: Cache cleared before writes for consistency
- **O(1) lookup**: In-memory Map for fast entry access

### Cache Statistics

View cache performance in verbose mode:

```bash
transcriptor data --verbose
```

Output includes:
- Entries cached
- Cache hit/miss ratio
- Estimated memory usage
- Metadata count

### Performance Targets

| Operation | Target | Measured |
|-----------|--------|----------|
| Registry load (1000 entries) | < 100ms | TBD |
| Single transcript fetch | < 2s | TBD |
| Batch processing | > 10 items/min | TBD |
| Memory usage | < 100MB | TBD |

### Profiling

Enable profiling for performance analysis:

```bash
PROFILE=true NODE_ENV=development transcriptor --verbose
```

## Progress Indicators

Progress bars automatically display for batch operations:

```bash
transcriptor
```

Output:
```
Processing URLs: [=========================     ] 50% (5/10) dGw3k2... - 15s remaining
```

Progress bars are automatically disabled:
- When output is redirected (pipes, files)
- In quiet mode (`--quiet`)
- When TTY not available

## Troubleshooting

### Installation Fails: Permission Denied

**Windows**: Enable Developer Mode or run as Administrator

**macOS/Linux**: Use one of these methods:

```bash
# Method 1: Change npm prefix
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH

# Method 2: Use sudo (not recommended)
sudo npm link
```

### Command Not Found After Installation

Restart your terminal or:

```bash
# Check npm global bin path
npm config get prefix

# Add to PATH (example)
export PATH=/usr/local/bin:$PATH
```

### Registry Performance Slow

For large registries (>1000 entries), the cache should improve performance automatically. If still slow:

1. Check cache statistics: `transcriptor data --verbose`
2. Verify memory usage is reasonable
3. Consider cleaning old transcripts: `transcriptor clean YYYY-MM-DD`

### Cache Corruption

If you suspect cache issues:

1. Cache automatically invalidates on write operations
2. Fallback to direct file read on cache errors
3. Restart command to reset cache state

## Platform-Specific Notes

### Windows

- **Symbolic Links**: Requires Developer Mode enabled or Administrator privileges
- **Path Separators**: Automatically handled by pathResolver utility
- **Terminal**: Progress bars supported in PowerShell and Command Prompt

### macOS

- **Home Directory**: Uses $HOME environment variable
- **Symbolic Links**: Fully supported without special permissions
- **Terminal**: Full ANSI color support

### Linux

- **Home Directory**: Uses $HOME environment variable
- **Symbolic Links**: Fully supported
- **Terminal**: Full ANSI color support

## Security Considerations

### API Key Protection

- Never committed to version control
- Never logged in error messages or verbose output
- Stored only in .env file

### Path Traversal Prevention

- All video IDs validated with strict regex
- Paths validated before file operations
- Symbolic links only created within allowed directories

### Input Validation

- Video IDs: 11-character alphanumeric + dash only
- Dates: YYYY-MM-DD format validation
- Paths: Absolute path validation

## Memory Management

### Cache Size Limits

- Maximum 1000 entries in memory
- LRU eviction when limit exceeded
- Estimated memory: <100MB with full cache

### Large Datasets

For repositories with 5000+ transcripts:

1. Cache handles efficiently with LRU eviction
2. Metadata-only loading avoids full registry parse
3. Statistics calculated from cached metadata

## Development Tools

### Profiler Utility

```javascript
const { profiler } = require('./src/utils/Profiler');

profiler.start('operation-name');
// ... operation code ...
profiler.log('operation-name');
```

### Memory Profiling

```javascript
const { logMemoryUsage } = require('./src/utils/Profiler');

logMemoryUsage('After registry load');
```

### Benchmarking

```javascript
const { benchmark } = require('./src/utils/Profiler');

const stats = await benchmark('registry-load', async () => {
  await storage.loadRegistry();
}, 10);

console.log(stats); // { min, max, median, avg, total }
```

## Monitoring

### Cache Hit Ratio

Target: >90% for typical usage

Monitor with:
```bash
transcriptor data --verbose
```

Look for: "Cache hit: metadata" or "Cache miss: loading from disk"

### Performance Degradation

Signs of issues:
- Statistics command >1s for <1000 entries
- Memory usage >100MB
- Frequent cache misses

Solutions:
- Check disk I/O performance
- Verify registry file not corrupted
- Clear cache by restarting command

## Changelog

### Version 1.0.0

**Features**:
- Installation/uninstallation scripts
- Registry caching with LRU eviction
- Progress indicators for batch operations
- Verbosity control (--quiet, --verbose)
- Performance profiling utilities

**Performance**:
- Metadata-only statistics calculation
- O(1) entry lookup
- <100ms registry load for 1000 entries (target)

**Security**:
- API key sanitization in all outputs
- Path traversal prevention
- Input validation hardening
