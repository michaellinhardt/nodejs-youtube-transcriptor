/**
 * Help Command Handler
 *
 * Implements FR-8.2: Display usage information
 * Implements TR-2: Help command specification
 * Also triggered by FR-1.2 when youtube.md missing
 *
 * @returns {void}
 */

let version = 'unknown';
try {
  const pkg = require('../../package.json');
  version = pkg.version || 'unknown';
} catch (error) {
  // Fallback silently - help should display even if version unavailable
}

/**
 * Sanitize version string to prevent injection vectors
 * @param {string} ver - Version string to sanitize
 * @returns {string} Sanitized version string
 */
function sanitizeVersion(ver) {
  if (typeof ver !== 'string') {
    return 'unknown';
  }
  return ver.replace(/[^\d.-a-zA-Z]/g, '');
}

function helpCommand() {
  const safeVersion = sanitizeVersion(version);

  // Header section
  console.log(`Transcriptor v${safeVersion}`);
  console.log('YouTube transcript extraction and management tool\n');

  // Usage section
  console.log('USAGE:');
  console.log('  transcriptor [command] [options]\n');

  // Commands section (categorized)
  console.log('COMMANDS:\n');
  console.log('  Main Processing:');
  console.log('    transcriptor              Process youtube.md in current directory');
  console.log('                              Creates transcripts/ folder with .md files\n');

  console.log('  Repository Inspection:');
  console.log('    transcriptor data         Display repository statistics');
  console.log('                              Shows count, size, date range\n');

  console.log('  Maintenance:');
  console.log('    transcriptor clean DATE   Remove transcripts older than DATE');
  console.log('                              Format: YYYY-MM-DD (exclusive)\n');

  console.log('  Information:');
  console.log('    transcriptor help         Display this help information');
  console.log('    transcriptor --version    Display version information\n');

  // Examples section
  console.log('EXAMPLES:\n');

  console.log('  1. Create youtube.md with YouTube URLs:');
  console.log('     $ echo "https://www.youtube.com/watch?v=dQw4w9WgXcQ" > youtube.md');
  console.log('     $ echo "https://youtu.be/jNQXAC9IVRw" >> youtube.md');
  console.log('     $ transcriptor');
  console.log('     → Creates ./transcripts/ with linked .md files\n');

  console.log('  2. View repository statistics:');
  console.log('     $ transcriptor data');
  console.log('     → Displays: total count, size, date range\n');

  console.log('  3. Remove transcripts older than specific date:');
  console.log('     $ transcriptor clean 2024-06-01');
  console.log('     → Deletes transcripts added before 2024-06-01 (exclusive)\n');

  console.log('  4. Display help information:');
  console.log('     $ transcriptor help\n');

  // Configuration section
  console.log('CONFIGURATION:\n');
  console.log('  Required Environment Variable:');
  console.log('    SCRAPE_CREATORS_API_KEY   API key for transcript service');
  console.log('    Set in .env file or environment\n');

  console.log('  Input File:');
  console.log('    youtube.md                List of YouTube URLs (one per line)');
  console.log('                              Both youtube.com and youtu.be formats supported');
  console.log('                              Comments (#) and blank lines ignored\n');

  console.log('  Storage Location:');
  console.log('    ~/.transcriptor/          Centralized transcript repository');
  console.log('    ./transcripts/            Project-local symbolic links\n');

  // Footer section
  console.log('For more information, see project documentation.');
  console.log(
    'Report issues: https://github.com/michaellinhardt/nodejs-youtube-transcriptor/issues\n'
  );
}

module.exports = helpCommand;
