/**
 * Transcriptor Command Router
 *
 * Implements TR-18: CLI Entry Point routing
 * Configures commander.js and delegates to command handlers
 * Enhanced with verbosity control (task 9.3.5)
 *
 * Note: This file is required by bin/transcriptor after environment loaded
 * Do not add shebang or environment loading here
 */

const { program } = require('commander');
const { setVerbosity, LogLevel } = require('./utils/Logger');

// Load version from package.json dynamically
const { version } = require('../package.json');

/**
 * Wrap async command handlers in error handler
 * Prevents unhandled promise rejections from crashing CLI
 * Always shows stack trace for debugging and bug reports
 *
 * @param {Function} fn - Async command handler function
 * @returns {Function} Wrapped handler with error handling
 */
function asyncHandler(fn) {
  return async function (...args) {
    try {
      await fn(...args);
    } catch (error) {
      console.error('Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  };
}

// Configure program metadata with global verbosity options
program
  .name('transcriptor')
  .description('YouTube transcript extraction and management tool')
  .version(version)
  .option('-q, --quiet', 'Suppress all output except errors')
  .option('-v, --verbose', 'Show detailed operation logs')
  .option('--rag-generator', 'Execute RAG generator after processing transcripts');

/**
 * Setup verbosity based on command line flags
 * Must run before any command execution
 */
function setupVerbosity() {
  const opts = program.opts();

  // Validate mutually exclusive flags
  if (opts.quiet && opts.verbose) {
    console.error('Error: --quiet and --verbose are mutually exclusive');
    process.exit(1);
  }

  if (opts.quiet) {
    setVerbosity(LogLevel.ERROR);
  } else if (opts.verbose) {
    setVerbosity(LogLevel.VERBOSE);
  }
  // Default is LogLevel.INFO (already set in Logger)
}

/**
 * Setup all command handlers
 * Ensures all commands registered before parsing begins
 */
function setupCommands() {
  // Default action: process youtube.md file in current directory
  // Implements FR-8.1, TR-1, FR-12.1 (RAG generator integration)
  program.action(
    asyncHandler(async () => {
      let processCommand;
      try {
        processCommand = require('./commands/process');
      } catch (error) {
        throw new Error(`Failed to load process command: ${error.message}`);
      }
      const opts = program.opts();
      await processCommand(opts);
    })
  );

  // Help command: display comprehensive usage information
  // Implements FR-8.2, TR-2
  program
    .command('help')
    .description('Display detailed usage information')
    .action(() => {
      let helpCommand;
      try {
        helpCommand = require('./commands/help');
      } catch (error) {
        console.error(`Failed to load help command: ${error.message}`);
        process.exit(1);
      }
      helpCommand();
    });

  // Data statistics command: show repository metrics
  // Implements FR-5.1, FR-8.3, TR-3
  program
    .command('data')
    .description('Display repository statistics and metrics')
    .action(
      asyncHandler(async () => {
        let dataCommand;
        try {
          dataCommand = require('./commands/data');
        } catch (error) {
          throw new Error(`Failed to load data command: ${error.message}`);
        }
        await dataCommand();
      })
    );

  // Clean command: remove old transcripts by date
  // Implements FR-6, FR-8.4, TR-4
  program
    .command('clean <date>')
    .description('Remove transcripts older than specified date (YYYY-MM-DD)')
    .action(
      asyncHandler(async (date) => {
        let cleanCommand;
        try {
          cleanCommand = require('./commands/clean');
        } catch (error) {
          throw new Error(`Failed to load clean command: ${error.message}`);
        }
        await cleanCommand(date);
      })
    );
}

// Parse command line arguments
// Setup verbosity BEFORE executing commands (critical for preAction hook)
(async () => {
  try {
    setupCommands();

    // Use preAction hook to set verbosity before any command runs
    program.hook('preAction', (thisCommand) => {
      setupVerbosity();
    });

    await program.parseAsync(process.argv);
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
})();
