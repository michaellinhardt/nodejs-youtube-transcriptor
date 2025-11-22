/**
 * RAGExecutor - RAG Generator Process Execution Utility
 *
 * Implements FR-12.2, FR-13.2, TR-37, TR-38, TR-39, TR-40, TR-47, TR-48
 *
 * Spawns claude-code RAG generator command in ./transcripts directory
 * Provides non-blocking execution with real-time output streaming
 * Handles all error scenarios as non-fatal (RAG failures don't impact transcript processing)
 * Supports multiple command types: 'default' (/rag-generator) and 'gemini' (/rag-generator-gemini)
 *
 * Usage:
 *   const RAGExecutor = require('../utils/RAGExecutor');
 *   const result = await RAGExecutor.execute(process.cwd(), 'default');
 *   const geminiResult = await RAGExecutor.execute(process.cwd(), 'gemini');
 *
 * @module RAGExecutor
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

class RAGExecutor {
  /**
   * Command type mapping
   * Implements TR-48: RAG Executor Command Type Support
   *
   * Maps command types to their corresponding commands:
   * - default: Uses claude CLI with /rag-generator slash command
   * - gemini: Uses standalone gemini-rag-generator command
   */
  /**
   * Get the path to the gemini-rag-generator script
   * Resolves relative to the project root directory
   */
  static getGeminiScriptPath() {
    // Get the project root (where package.json is located)
    const projectRoot = path.resolve(__dirname, '../..');
    return path.join(projectRoot, 'scripts', 'gemini-rag-generator.sh');
  }

  static COMMAND_TYPES = {
    default: {
      type: 'claude',
      command: 'claude --dangerously-skip-permissions -p /rag-generator'
    },
    gemini: {
      type: 'standalone',
      // Use getter function to resolve path dynamically
      get command() {
        return RAGExecutor.getGeminiScriptPath();
      }
    }
  };
  /**
   * Execute RAG generator in ./transcripts directory
   *
   * Implements FR-12.2, FR-13.2: Execute RAG generator after successful processing
   * Implements TR-37, TR-47: RAG process execution with spawn
   * Implements TR-38: Process spawn implementation with correct options
   * Implements TR-39: Working directory configuration
   * Implements TR-40: RAG generator error handling (non-fatal)
   * Implements TR-48: Command type support (default and gemini)
   *
   * Commands:
   * - default: claude --dangerously-skip-permissions -p /rag-generator
   * - gemini: {projectRoot}/scripts/gemini-rag-generator.sh
   * Working directory: {projectDir}/transcripts
   * Output: Direct to console (stdio: inherit)
   *
   * Error handling:
   * - ENOENT: Command not found (claude not installed)
   * - EACCES: Permission denied
   * - Spawn errors: Unexpected process spawn failures
   * - Exit non-zero: RAG process ran but failed
   * - All errors are NON-FATAL per FR-12.3, FR-13.3
   *
   * @param {string} projectDir - Project root directory (defaults to cwd)
   * @param {string} commandType - Command type: 'default' or 'gemini' (defaults to 'default')
   * @returns {Promise<Object>} Result object with executed, exitCode, error
   *
   * Result object schema:
   * {
   *   executed: boolean,      // true if spawn attempted
   *   exitCode: number|null,  // 0 for success, non-zero for failure, null if spawn failed
   *   error: string|null,     // Error message if spawn/execution failed
   *   commandType: string     // Type of command executed ('default' or 'gemini')
   * }
   *
   * @throws {Error} Only if transcripts directory doesn't exist or invalid commandType
   */
  static async execute(projectDir = process.cwd(), commandType = 'default') {
    // TR-48: Validate command type
    const commandConfig = RAGExecutor.COMMAND_TYPES[commandType];
    if (!commandConfig) {
      throw new Error(
        `Invalid command type: ${commandType}. Valid types: ${Object.keys(RAGExecutor.COMMAND_TYPES).join(', ')}`
      );
    }

    const transcriptsDir = path.resolve(projectDir, 'transcripts');

    // TR-39: Validate working directory exists
    const dirExists = await fs.pathExists(transcriptsDir);
    if (!dirExists) {
      throw new Error(`Transcripts directory not found: ${transcriptsDir}`);
    }

    return new Promise((resolve) => {
      // TR-38, TR-48: Spawn configuration per specification with command type mapping
      // Use explicit cd command to ensure proper directory context
      const command = `cd "${transcriptsDir}" && ${commandConfig.command} && cd -`;

      const childProcess = spawn(
        command,
        [],
        {
          stdio: 'inherit', // Direct console output (real-time streaming)
          shell: true, // Enable shell parsing (required for cd command)
          env: {
            ...process.env,
            // Force color output for subprocesses
            FORCE_COLOR: '1',
            TERM: process.env.TERM || 'xterm-256color'
          }
        }
      );

      // TR-42: Track process state with command type
      const result = {
        executed: true,
        exitCode: null,
        error: null,
        commandType: commandType
      };

      // Handle process completion
      // Close event fires when stdio streams close (most reliable)
      childProcess.on('close', (code, signal) => {
        result.exitCode = code;

        // TR-40: Handle signal termination
        if (signal) {
          result.error = `Process terminated by signal: ${signal}`;
        }

        resolve(result);
      });

      // TR-40: Handle spawn errors (command not found, permission denied, etc.)
      // Error event fires when process fails to spawn
      childProcess.on('error', (err) => {
        result.exitCode = -1;

        // TR-40: Provide actionable error messages based on error code
        // Include command type in error messages for clarity
        const cmdName =
          commandType === 'gemini'
            ? RAGExecutor.getGeminiScriptPath()
            : 'claude';
        const installHint =
          commandType === 'gemini'
            ? `Please ensure the script exists at ${RAGExecutor.getGeminiScriptPath()}`
            : 'Please install claude-code CLI tool.';

        if (err.code === 'ENOENT') {
          result.error = `Command not found: ${cmdName}. ${installHint}`;
        } else if (err.code === 'EACCES') {
          result.error = `Permission denied executing ${cmdName} command. Check executable permissions.`;
        } else {
          result.error = `${err.message} (Command type: ${commandType})`;
        }

        // Non-fatal: Always resolve, never reject
        resolve(result);
      });
    });
  }
}

module.exports = RAGExecutor;
